process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
jest.mock("../src/config/prisma", () => ({}));
const repository = require("../src/features/wallet/wallet.repository");
const payments = require("../src/features/payments/payments.repository");

describe("Wallet totals", () => {
  test("separates purchased tokens and gross spending from bonuses, refunds and adjustments", async () => {
    const groups = [
      ["TOKEN_TOP_UP", 56], ["SIGNUP_BONUS", 10], ["REFUND", 5],
      ["ADMIN_CREDIT", 100], ["ERRAND_POST_DEBIT", 3], ["TRIP_POST_DEBIT", 2],
      ["ERRAND_ACCEPT_DEBIT", 4], ["ADMIN_DEBIT", 1],
    ].map(([transactionType, tokenAmount]) => ({ transactionType, _sum: { tokenAmount } }));
    const client = { walletTransaction: { groupBy: jest.fn().mockResolvedValue(groups) } };
    await expect(repository.getWalletTotals("own-wallet", client)).resolves.toEqual({
      totalTokensPurchased: 56, totalTokensSpent: 10,
    });
    expect(client.walletTransaction.groupBy).toHaveBeenCalledWith({
      by: ["transactionType"], where: { walletId: "own-wallet" }, _sum: { tokenAmount: true },
    });
  });
  test("new wallet has zero totals", async () => {
    const client = { walletTransaction: { groupBy: jest.fn().mockResolvedValue([]) } };
    await expect(repository.getWalletTotals("own-wallet", client)).resolves.toEqual({
      totalTokensPurchased: 0, totalTokensSpent: 0,
    });
  });
});

describe("Wallet activity repository", () => {
  let db, client;
  beforeEach(() => {
    db = {
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      paymentInvoice: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    client = { $transaction: jest.fn((callback) => callback(db)) };
  });
  test("merges before paginating, excludes paid invoices, and scopes both sources to the user", async () => {
    db.walletTransaction.findMany.mockResolvedValue([
      { id: "c", createdAt: new Date("2026-09-03"), transactionType: "TOKEN_TOP_UP", tokenAmount: 28, paymentInvoiceId: "paid" },
      { id: "a", createdAt: new Date("2026-09-01"), transactionType: "SIGNUP_BONUS", tokenAmount: 10 },
    ]);
    db.paymentInvoice.findMany.mockResolvedValue([
      { id: "b", createdAt: new Date("2026-09-02"), status: "FAILED", totalTokens: 28, rejectionNotes: "Incorrect amount" },
    ]);
    db.walletTransaction.count.mockResolvedValue(2);
    db.paymentInvoice.count.mockResolvedValue(1);
    const result = await repository.getWalletActivity("owner", "wallet", { skip: 1, take: 1 }, client);
    expect(result.pagination).toEqual({ skip: 1, take: 1, total: 3 });
    expect(result.transactions).toEqual([expect.objectContaining({
      id: "b", source: "PAYMENT_INVOICE", status: "FAILED", transactionType: "TOKEN_TOP_UP",
      paymentInvoiceId: "b", balanceBefore: null, balanceAfter: null, rejectionNotes: "Incorrect amount",
    })]);
    const ledgerWhere = { walletId: "wallet" };
    const invoiceWhere = { userId: "owner", status: { in: ["PENDING", "PENDING_VERIFICATION", "FAILED", "EXPIRED"] } };
    expect(db.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ledgerWhere, take: 2 }));
    expect(db.walletTransaction.count).toHaveBeenCalledWith({ where: ledgerWhere });
    expect(db.paymentInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: invoiceWhere, take: 2 }));
    expect(db.paymentInvoice.count).toHaveBeenCalledWith({ where: invoiceWhere });
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(db.paymentInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "owner" }),
    }));
  });
  test("successful top-ups come only from the ledger", async () => {
    db.walletTransaction.findMany.mockResolvedValue([{ id: "ledger", createdAt: new Date(), tokenAmount: 28 }]);
    db.walletTransaction.count.mockResolvedValue(1);
    const result = await repository.getWalletActivity("owner", "wallet", { status: "SUCCESS", transactionType: "TOKEN_TOP_UP" }, client);
    expect(result.transactions[0]).toMatchObject({ status: "SUCCESS", source: "WALLET_TRANSACTION" });
    expect(db.walletTransaction.count).toHaveBeenCalledWith({ where: { walletId: "wallet", transactionType: "TOKEN_TOP_UP" } });
    expect(db.paymentInvoice.findMany).not.toHaveBeenCalled();
    expect(result.pagination.total).toBe(1);
  });
  test.each(["PENDING", "PENDING_VERIFICATION", "FAILED", "EXPIRED"])("%s applies the same filter to invoice rows and count", async (status) => {
    await repository.getWalletActivity("owner", "wallet", { status, transactionType: "TOKEN_TOP_UP" }, client);
    expect(db.walletTransaction.findMany).not.toHaveBeenCalled();
    expect(db.paymentInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner", status } }));
    expect(db.paymentInvoice.count).toHaveBeenCalledWith({ where: { userId: "owner", status } });
  });
  test("non-payment type with failed status returns an empty page", async () => {
    const result = await repository.getWalletActivity("owner", "wallet", { status: "FAILED", transactionType: "REFUND" }, client);
    expect(result).toEqual({ transactions: [], pagination: { skip: 0, take: 20, total: 0 } });
    expect(db.walletTransaction.findMany).not.toHaveBeenCalled();
    expect(db.paymentInvoice.findMany).not.toHaveBeenCalled();
  });
  test("type-only filtering omits payment attempts for debit operations", async () => {
    await repository.getWalletActivity("owner", "wallet", { transactionType: "ERRAND_POST_DEBIT" }, client);
    expect(db.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { walletId: "wallet", transactionType: "ERRAND_POST_DEBIT" } }));
    expect(db.paymentInvoice.findMany).not.toHaveBeenCalled();
  });
  test("out-of-range page preserves total", async () => {
    db.walletTransaction.count.mockResolvedValue(3);
    const result = await repository.getWalletActivity("owner", "wallet", { skip: 20, take: 5 }, client);
    expect(result).toEqual({ transactions: [], pagination: { skip: 20, take: 5, total: 3 } });
  });
  test("ties sort deterministically by descending id across both sources", async () => {
    const createdAt = new Date();
    db.walletTransaction.findMany.mockResolvedValue([{ id: "a", createdAt }]);
    db.paymentInvoice.findMany.mockResolvedValue([{ id: "b", createdAt, status: "PENDING", totalTokens: 1 }]);
    const result = await repository.getWalletActivity("owner", "wallet", {}, client);
    expect(result.transactions.map((row) => row.id)).toEqual(["b", "a"]);
  });
});

describe("Payment expiry queries", () => {
  test.each(["user", "invoice"])("expires only overdue QR/OTP or unsubmitted bank invoices by %s", async (scope) => {
    const client = { paymentInvoice: { updateMany: jest.fn() } };
    const now = new Date();
    if (scope === "user") await payments.expirePendingInvoicesForUser("owner", now, client);
    else await payments.expirePendingInvoiceById("invoice", now, client);
    expect(client.paymentInvoice.updateMany).toHaveBeenCalledWith({
      where: {
        ...(scope === "user" ? { userId: "owner" } : { id: "invoice" }),
        expiresAt: { lte: now },
        OR: [
          { status: "PENDING" },
          { paymentMethod: "BANK_TRANSFER", status: "PENDING_VERIFICATION", transferReceiptPath: null },
        ],
      }, data: { status: "EXPIRED" },
    });
  });
});
