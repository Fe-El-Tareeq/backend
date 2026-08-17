process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";

jest.mock("../src/features/wallet/wallet.repository");
jest.mock("../src/config/prisma", () => ({
  $transaction: jest.fn(),
}));

const prisma = require("../src/config/prisma");
const repository = require("../src/features/wallet/wallet.repository");
const service = require("../src/features/wallet/wallet.service");

const tx = { transaction: "test" };
const wallet = {
  id: "wallet-1",
  user_id: "user-1",
  token_balance: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  repository.lockWallet.mockResolvedValue(wallet);
  repository.findByIdempotencyKey.mockResolvedValue(null);
  repository.updateBalance.mockResolvedValue({});
  repository.createLedgerEntry.mockImplementation(async (data) => ({
    id: "transaction-1",
    ...data,
  }));
});

describe("Wallet idempotency scope", () => {
  test("debit returns the existing transaction for the same idempotency key and payload", async () => {
    const existingTransaction = {
      id: "existing-transaction",
      walletId: wallet.id,
      idempotencyKey: "shared-key",
      tokenAmount: 2,
      transactionType: "ERRAND_POST_DEBIT",
      referenceType: null,
      referenceId: null,
    };

    repository.findByIdempotencyKey.mockResolvedValue(existingTransaction);

    const result = await service.debit({
      userId: "user-1",
      amount: 2,
      transactionType: "ERRAND_POST_DEBIT",
      idempotencyKey: "shared-key",
    });

    expect(repository.lockWallet).toHaveBeenCalledWith("user-1", tx);

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(
      "wallet-1",
      "shared-key",
      tx,
    );

    expect(repository.lockWallet.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findByIdempotencyKey.mock.invocationCallOrder[0],
    );

    // The wallet must not be updated again for the same operation.
    expect(repository.updateBalance).not.toHaveBeenCalled();

    // No duplicate ledger entry should be created.
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();

    expect(result).toBe(existingTransaction);
  });

  test("debit returns 409 when the same idempotency key is reused with different payload", async () => {
    const existingTransaction = {
      id: "existing-transaction",
      walletId: wallet.id,
      idempotencyKey: "shared-key",
      tokenAmount: 2,
      transactionType: "ERRAND_POST_DEBIT",
      referenceType: "ERRAND",
      referenceId: "11111111-1111-1111-1111-111111111111",
    };

    repository.findByIdempotencyKey.mockResolvedValue(existingTransaction);

    await expect(
      service.debit({
        userId: "user-1",
        amount: 5,
        transactionType: "ERRAND_POST_DEBIT",
        referenceType: "ERRAND",
        referenceId: "11111111-1111-1111-1111-111111111111",
        idempotencyKey: "shared-key",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Idempotency key has already been used with different operation data",
    });

    // A conflicting retry must not change the wallet.
    expect(repository.updateBalance).not.toHaveBeenCalled();

    // A conflicting retry must not create another ledger entry.
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();
  });
  test("credit returns 409 when the same idempotency key is reused with different payload", async () => {
    const existingTransaction = {
      id: "existing-credit",
      walletId: wallet.id,
      idempotencyKey: "credit-key",
      tokenAmount: 3,
      transactionType: "ADMIN_CREDIT",
      referenceType: null,
      referenceId: null,
    };

    repository.findByIdempotencyKey.mockResolvedValue(existingTransaction);

    await expect(
      service.credit({
        userId: "user-1",
        amount: 5,
        transactionType: "ADMIN_CREDIT",
        idempotencyKey: "credit-key",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Idempotency key has already been used with different operation data",
    });

    expect(repository.updateBalance).not.toHaveBeenCalled();
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();
  });
  test("credit scopes an idempotency lookup to the locked wallet", async () => {
    await service.credit({
      userId: "user-1",
      amount: 3,
      transactionType: "ADMIN_CREDIT",
      idempotencyKey: "shared-key",
    });

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(
      "wallet-1",
      "shared-key",
      tx,
    );
    expect(repository.updateBalance).toHaveBeenCalledWith("wallet-1", 13, tx);
  });

  test("debit creates one scoped ledger entry and updates the balance", async () => {
    const result = await service.debit({
      userId: "user-1",
      amount: 4,
      transactionType: "TRIP_POST_DEBIT",
      idempotencyKey: "trip-key",
    });

    expect(repository.updateBalance).toHaveBeenCalledWith("wallet-1", 6, tx);
    expect(repository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-1",
        idempotencyKey: "trip-key",
        balanceBefore: 10,
        balanceAfter: 6,
      }),
      tx,
    );
    expect(result.id).toBe("transaction-1");
  });

  test("refund still requires an idempotency key", async () => {
    await expect(
      service.refund({ userId: "user-1", amount: 1 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Idempotency key is required for refunds",
    });
  });
});
