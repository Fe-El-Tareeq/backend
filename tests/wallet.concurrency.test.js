process.env.NODE_ENV = "test";

require("dotenv").config({ quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required for wallet concurrency tests.",
  );
}

// Forces this integration test to use the local test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const crypto = require("crypto");
const prisma = require("../src/config/prisma");
const walletService = require("../src/features/wallet/wallet.service");

// Extra safety check to prevent running against Supabase.
if (!process.env.DATABASE_URL.includes("wallet_test")) {
  throw new Error(
    "Concurrency test must run against the local wallet_test database.",
  );
}

describe("Wallet Concurrency Integration Tests", () => {
  let user;
  let wallet;

  beforeEach(async () => {
    // Creates a unique phone number for every test run.
    const randomNumber = crypto.randomInt(1000000, 9999999);

    user = await prisma.user.create({
      data: {
        phone: `+97059${randomNumber}`,
      },
    });

    // Starts the test wallet with exactly 5 tokens.
    wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        tokenBalance: 5,
      },
    });
  });

  afterEach(async () => {
    // Cleans up all data created by this test.
    if (wallet?.id) {
      await prisma.walletTransaction.deleteMany({
        where: {
          walletId: wallet.id,
        },
      });

      await prisma.wallet.deleteMany({
        where: {
          id: wallet.id,
        },
      });
    }

    if (user?.id) {
      await prisma.user.deleteMany({
        where: {
          id: user.id,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("only one concurrent debit succeeds when the balance is insufficient for both", async () => {
    // Both operations try to deduct 4 tokens from a wallet containing only 5.
    const results = await Promise.allSettled([
      walletService.debit({
        userId: user.id,
        amount: 4,
        transactionType: "ERRAND_POST_DEBIT",
        idempotencyKey: `concurrency-a-${user.id}`,
        description: "Concurrency debit A",
      }),

      walletService.debit({
        userId: user.id,
        amount: 4,
        transactionType: "ERRAND_POST_DEBIT",
        idempotencyKey: `concurrency-b-${user.id}`,
        description: "Concurrency debit B",
      }),
    ]);

    const successfulOperations = results.filter(
      (result) => result.status === "fulfilled",
    );

    const failedOperations = results.filter(
      (result) => result.status === "rejected",
    );

    // Only one debit must succeed.
    expect(successfulOperations).toHaveLength(1);

    // The second debit must fail because only 1 token remains.
    expect(failedOperations).toHaveLength(1);

    expect(failedOperations[0].reason).toMatchObject({
      statusCode: 400,
      message: "Insufficient token balance",
    });

    // Reads the final wallet balance directly from PostgreSQL.
    const finalWallet = await prisma.wallet.findUnique({
      where: {
        id: wallet.id,
      },
    });

    expect(finalWallet.tokenBalance).toBe(1);

    // Only the successful debit should have a ledger entry.
    const ledgerEntries = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        transactionType: "ERRAND_POST_DEBIT",
      },
    });

    expect(ledgerEntries).toHaveLength(1);

    expect(ledgerEntries[0]).toMatchObject({
      tokenAmount: 4,
      balanceBefore: 5,
      balanceAfter: 1,
    });
  });
});
