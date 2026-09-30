process.env.NODE_ENV = "test";
require("dotenv").config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for wallet activity integration tests.");
const testUrl = new URL(process.env.TEST_DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(testUrl.hostname) || !testUrl.pathname.includes("wallet_test")) {
  throw new Error("Wallet activity integration tests require a local wallet_test database.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const crypto = require("crypto");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/wallet/wallet.repository");

// Each test runs in a transaction that is deliberately rolled back, including
// when an assertion fails. No fixture is left in the local database.
async function withFixture(check) {
  const rollback = new Error("Rollback test fixtures");
  try {
    await prisma.$transaction(async (db) => {
      const user = await db.user.create({ data: { phone: "+97059" + crypto.randomInt(1000000, 9999999) } });
      const wallet = await db.wallet.create({ data: { userId: user.id, tokenBalance: 33 } });
      const tokenPackage = await db.tokenPackage.create({
        data: { name: "Wallet test " + crypto.randomUUID(), tokenAmount: 25, bonusTokens: 3, priceNis: 12 },
      });
      const createInvoice = (overrides = {}) => db.paymentInvoice.create({
        data: {
          userId: user.id, tokenPackageId: tokenPackage.id, tokenAmount: 25, bonusTokens: 3,
          totalTokens: 28, amountNis: 12, paymentProvider: "BANK_TRANSFER", paymentMethod: "BANK_TRANSFER",
          status: "PENDING_VERIFICATION", expiresAt: new Date(Date.now() + 60000), ...overrides,
        },
      });
      const paid = await createInvoice({ status: "PAID" });
      await db.walletTransaction.createMany({ data: [
        { walletId: wallet.id, transactionType: "SIGNUP_BONUS", tokenAmount: 10, balanceBefore: 0, balanceAfter: 10 },
        { walletId: wallet.id, transactionType: "TOKEN_TOP_UP", tokenAmount: 28, balanceBefore: 10, balanceAfter: 38, paymentInvoiceId: paid.id },
        { walletId: wallet.id, transactionType: "ERRAND_POST_DEBIT", tokenAmount: 7, balanceBefore: 38, balanceAfter: 31 },
        { walletId: wallet.id, transactionType: "REFUND", tokenAmount: 2, balanceBefore: 31, balanceAfter: 33 },
      ] });
      const client = { $transaction: (callback) => callback(db) };
      await check({ db, user, wallet, paid, createInvoice, client });
      throw rollback;
    }, { timeout: 15000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
afterAll(() => prisma.$disconnect());

test("real database totals exclude refunds and signup bonuses", async () => {
  await withFixture(async ({ db, wallet }) => {
    await expect(repository.getWalletTotals(wallet.id, db)).resolves.toEqual({
      totalTokensPurchased: 28, totalTokensSpent: 7,
    });
  });
});
test("real activity filters, counts and pagination do not duplicate paid invoices", async () => {
  await withFixture(async ({ user, wallet, paid, createInvoice, client }) => {
    const failed = await createInvoice({ status: "FAILED", rejectionNotes: "Incorrect amount" });
    await createInvoice();
    const all = await repository.getWalletActivity(user.id, wallet.id, {}, client);
    expect(all.pagination.total).toBe(6);
    expect(all.transactions.filter((row) => row.paymentInvoiceId === paid.id)).toHaveLength(1);
    const rejected = await repository.getWalletActivity(user.id, wallet.id, { status: "FAILED", transactionType: "TOKEN_TOP_UP" }, client);
    expect(rejected.pagination.total).toBe(1);
    expect(rejected.transactions[0]).toMatchObject({ id: failed.id, balanceBefore: null, balanceAfter: null });
    const page = await repository.getWalletActivity(user.id, wallet.id, { skip: 2, take: 2 }, client);
    expect(page.transactions.map((row) => row.id)).toEqual(all.transactions.slice(2, 4).map((row) => row.id));
    const other = await repository.getWalletActivity(crypto.randomUUID(), crypto.randomUUID(), {}, client);
    expect(other.pagination.total).toBe(0);
  });
});
test("real expiry leaves submitted bank receipts pending review", async () => {
  await withFixture(async ({ user, wallet, createInvoice, client }) => {
    const overdue = await createInvoice({ expiresAt: new Date(0) });
    const submitted = await createInvoice({ expiresAt: new Date(0), transferReceiptPath: "test/receipt.pdf" });
    const all = await repository.getWalletActivity(user.id, wallet.id, {}, client);
    expect(all.transactions.find((row) => row.id === overdue.id).status).toBe("EXPIRED");
    expect(all.transactions.find((row) => row.id === submitted.id).status).toBe("PENDING_VERIFICATION");
  });
});
