process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";

jest.mock("../src/config/env", () => ({
  nodeEnv: "test",
  bankTransferBeneficiaryName: "Test beneficiary",
  bankTransferAccountNumber: "123456",
  bankTransferBankName: "Test bank",
}));
jest.mock("../src/config/prisma", () => ({ $transaction: jest.fn() }));
jest.mock("../src/features/payments/payments.repository");
jest.mock("../src/features/payments/paymentReceipt.storage");
jest.mock("../src/features/wallet/wallet.service");
jest.mock("../src/features/notifications/notifications.service");

const prisma = require("../src/config/prisma");
const repository = require("../src/features/payments/payments.repository");
const storage = require("../src/features/payments/paymentReceipt.storage");
const wallet = require("../src/features/wallet/wallet.service");
const notifications = require("../src/features/notifications/notifications.service");
const service = require("../src/features/payments/payments.service");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const adminId = "550e8400-e29b-41d4-a716-446655440002";
const invoiceId = "750e8400-e29b-41d4-a716-446655440001";
const tx = { transaction: "bank-transfer-test" };
const receiptUrl = "https://storage.example.test/signed/receipt";
const rejectionNotes = "The transferred amount does not match the invoice.";
const makeInvoice = (overrides = {}) => ({
  id: invoiceId,
  userId,
  tokenPackageId: "650e8400-e29b-41d4-a716-446655440001",
  clientRequestKey: "850e8400-e29b-41d4-a716-446655440001",
  tokenAmount: 25,
  bonusTokens: 3,
  totalTokens: 28,
  amountNis: 12,
  paymentMethod: "BANK_TRANSFER",
  paymentProvider: "BANK_TRANSFER",
  referenceCode: "ORD-TEST-123",
  status: "PENDING_VERIFICATION",
  transferReceiptPath: "private/receipt.pdf",
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  tokenPackage: { name: "Standard" },
  user: {
    id: userId,
    fullName: "Test user",
    phone: "0599000000",
    passwordHash: "private",
  },
  ...overrides,
});
let currentInvoice;

beforeEach(() => {
  jest.resetAllMocks();
  currentInvoice = makeInvoice();
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  repository.lockBankTransferInvoice.mockResolvedValue({ id: invoiceId });
  repository.findBankTransferInvoiceById.mockImplementation(async () => ({
    ...currentInvoice,
  }));
  repository.findInvoiceByIdForUser.mockImplementation(async () => ({
    ...currentInvoice,
  }));
  repository.claimBankTransferInvoice.mockImplementation(
    async (id, status, data) => {
      if (currentInvoice.status !== status) return { count: 0 };
      currentInvoice = { ...currentInvoice, ...data };
      return { count: 1 };
    },
  );
  storage.createSignedUrl.mockResolvedValue(receiptUrl);
  storage.upload.mockResolvedValue("private/new-receipt.pdf");
  storage.remove.mockResolvedValue();
});

const review = (decision) =>
  decision === "APPROVE"
    ? service.approveBankTransferInvoice(adminId, invoiceId)
    : service.rejectBankTransferInvoice(adminId, invoiceId, rejectionNotes);

const expectNoPaymentEffects = () => {
  expect(wallet.credit).not.toHaveBeenCalled();
  expect(repository.createPaymentTransaction).not.toHaveBeenCalled();
  expect(notifications.templates.paymentSuccess).not.toHaveBeenCalled();
  expect(notifications.templates.bankTransferRejected).not.toHaveBeenCalled();
  expect(repository.createAdminAuditLog).not.toHaveBeenCalled();
};

describe("Bank transfer decisions and dashboard data", () => {
  test.each(["APPROVE", "REJECT"])(
    "%s updates the invoice, audit trail and correct notification",
    async (decision) => {
      const approving = decision === "APPROVE";
      const status = approving ? "PAID" : "FAILED";
      const result = await review(decision);
      expect(repository.lockBankTransferInvoice).toHaveBeenCalledWith(
        invoiceId,
        tx,
      );
      expect(repository.claimBankTransferInvoice).toHaveBeenCalledWith(
        invoiceId,
        "PENDING_VERIFICATION",
        expect.objectContaining({
          status,
          reviewedAt: expect.any(Date),
          reviewedByAdminId: adminId,
          ...(approving
            ? { paidAt: expect.any(Date) }
            : { failedAt: expect.any(Date), rejectionNotes }),
        }),
        tx,
      );
      expect(result).toMatchObject({
        id: invoiceId,
        status,
        hasTransferReceipt: true,
        transferReceiptUrl: receiptUrl,
        receiptUrlExpiresInSeconds: 300,
        rejectionNotes: approving ? null : rejectionNotes,
        reviewedAt: expect.any(Date),
        user: { id: userId, fullName: "Test user", phone: "0599000000" },
      });
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("transferReceiptPath");
      expect(repository.createAdminAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId,
          targetUserId: userId,
          entityId: invoiceId,
          action: approving
            ? "BANK_TRANSFER_APPROVED"
            : "BANK_TRANSFER_REJECTED",
          oldValues: { status: "PENDING_VERIFICATION" },
          newValues: {
            status,
            rejectionNotes: approving ? null : rejectionNotes,
          },
        }),
        tx,
      );
      if (approving) {
        expect(wallet.credit).toHaveBeenCalledTimes(1);
        expect(wallet.credit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            amount: 28,
            paymentInvoiceId: invoiceId,
            idempotencyKey: "payment-invoice:" + invoiceId,
            client: tx,
          }),
        );
        expect(repository.createPaymentTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            invoiceId,
            provider: "BANK_TRANSFER",
            status: "SUCCESS",
            amountPaidNis: 12,
            providerTransactionId: "bank-transfer:ORD-TEST-123",
          }),
          tx,
        );
        expect(notifications.templates.paymentSuccess).toHaveBeenCalledTimes(1);
        expect(notifications.templates.paymentSuccess).toHaveBeenCalledWith(
          { userId, invoiceId, totalTokens: 28 },
          tx,
        );
        expect(
          notifications.templates.bankTransferRejected,
        ).not.toHaveBeenCalled();
      } else {
        expect(wallet.credit).not.toHaveBeenCalled();
        expect(repository.createPaymentTransaction).not.toHaveBeenCalled();
        expect(
          notifications.templates.bankTransferRejected,
        ).toHaveBeenCalledTimes(1);
        expect(
          notifications.templates.bankTransferRejected,
        ).toHaveBeenCalledWith({ userId, invoiceId, rejectionNotes }, tx);
        expect(notifications.templates.paymentSuccess).not.toHaveBeenCalled();
      }
      expect(notifications.templates.paymentFailure).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["APPROVE", "APPROVE"],
    ["APPROVE", "REJECT"],
    ["REJECT", "APPROVE"],
    ["REJECT", "REJECT"],
  ])(
    "after %s, %s cannot repeat effects or reverse the decision",
    async (first, second) => {
      await review(first);
      jest.clearAllMocks();
      await expect(review(second)).rejects.toMatchObject({ statusCode: 409 });
      expect(repository.claimBankTransferInvoice).not.toHaveBeenCalled();
      expectNoPaymentEffects();
    },
  );

  test.each(["APPROVE", "REJECT"])(
    "%s requires an uploaded receipt",
    async (decision) => {
      currentInvoice.transferReceiptPath = null;
      await expect(review(decision)).rejects.toMatchObject({ statusCode: 409 });
      expect(repository.claimBankTransferInvoice).not.toHaveBeenCalled();
      expectNoPaymentEffects();
    },
  );

  test.each(["PAID", "FAILED", "EXPIRED", "PENDING"])(
    "does not review an invoice in %s state",
    async (status) => {
      currentInvoice.status = status;
      for (const decision of ["APPROVE", "REJECT"]) {
        await expect(review(decision)).rejects.toMatchObject({
          statusCode: 409,
        });
      }
      expectNoPaymentEffects();
    },
  );

  test.each(["APPROVE", "REJECT"])(
    "%s loses a concurrent review without sending notifications",
    async (decision) => {
      repository.claimBankTransferInvoice.mockResolvedValue({ count: 0 });
      await expect(review(decision)).rejects.toMatchObject({ statusCode: 409 });
      expectNoPaymentEffects();
    },
  );

  test.each(["missing lock", "missing invoice", "wrong method"])(
    "rejects %s",
    async (scenario) => {
      if (scenario === "missing lock")
        repository.lockBankTransferInvoice.mockResolvedValue(null);
      if (scenario === "missing invoice")
        repository.findBankTransferInvoiceById.mockResolvedValue(null);
      if (scenario === "wrong method") currentInvoice.paymentMethod = "QR";
      for (const decision of ["APPROVE", "REJECT"]) {
        await expect(review(decision)).rejects.toMatchObject({
          statusCode: 404,
        });
      }
      expectNoPaymentEffects();
    },
  );

  test.each(["APPROVE", "REJECT"])(
    "%s propagates a notification failure from the transaction",
    async (decision) => {
      const error = new Error("Notification persistence failed");
      const template =
        decision === "APPROVE" ? "paymentSuccess" : "bankTransferRejected";
      notifications.templates[template].mockRejectedValue(error);
      await expect(review(decision)).rejects.toBe(error);
      expect(repository.createAdminAuditLog).not.toHaveBeenCalled();
      expect(storage.createSignedUrl).not.toHaveBeenCalled();
    },
  );

  test("wallet failure prevents approval notification and audit", async () => {
    const error = new Error("Wallet credit failed");
    wallet.credit.mockRejectedValue(error);
    await expect(review("APPROVE")).rejects.toBe(error);
    expect(notifications.templates.paymentSuccess).not.toHaveBeenCalled();
    expect(repository.createAdminAuditLog).not.toHaveBeenCalled();
  });

  test.each(["PENDING_VERIFICATION", "PAID", "FAILED"])(
    "dashboard lists %s with receipt and review details",
    async (status) => {
      const invoice = makeInvoice({
        status,
        rejectionNotes: status === "FAILED" ? rejectionNotes : null,
      });
      repository.listBankTransferInvoices.mockResolvedValue([invoice]);
      repository.countBankTransferInvoices.mockResolvedValue(7);
      const result = await service.listBankTransferInvoices({
        status,
        skip: 2,
        take: 5,
      });
      expect(repository.listBankTransferInvoices).toHaveBeenCalledWith({
        status,
        skip: 2,
        take: 5,
      });
      expect(repository.countBankTransferInvoices).toHaveBeenCalledWith(status);
      expect(result.pagination).toEqual({ skip: 2, take: 5, total: 7 });
      expect(result.invoices[0]).toMatchObject({
        id: invoiceId,
        status,
        referenceCode: invoice.referenceCode,
        rejectionNotes: invoice.rejectionNotes,
        transferReceiptUrl: receiptUrl,
        hasTransferReceipt: true,
        receiptUrlExpiresInSeconds: 300,
      });
      expect(storage.createSignedUrl).toHaveBeenCalledWith(
        invoice.transferReceiptPath,
      );
    },
  );

  test("dashboard defaults to pending review and supports invoices without receipts", async () => {
    repository.listBankTransferInvoices.mockResolvedValue([
      makeInvoice({ transferReceiptPath: null }),
    ]);
    repository.countBankTransferInvoices.mockResolvedValue(1);
    const result = await service.listBankTransferInvoices({});
    expect(repository.listBankTransferInvoices).toHaveBeenCalledWith({
      status: "PENDING_VERIFICATION",
      skip: 0,
      take: 20,
    });
    expect(result.invoices[0]).toMatchObject({
      hasTransferReceipt: false,
      transferReceiptUrl: null,
      receiptUrlExpiresInSeconds: null,
    });
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  test("dashboard returns an empty page", async () => {
    repository.listBankTransferInvoices.mockResolvedValue([]);
    repository.countBankTransferInvoices.mockResolvedValue(0);
    await expect(service.listBankTransferInvoices({})).resolves.toEqual({
      invoices: [],
      pagination: { skip: 0, take: 20, total: 0 },
    });
  });
});

describe("Bank transfer receipt submission", () => {
  const file = {
    buffer: Buffer.from("test receipt"),
    mimetype: "application/pdf",
  };

  test("replaces the receipt without crediting or sending a decision notification", async () => {
    repository.updateBankTransferReceipt.mockImplementation(
      async (id, owner, path) => {
        currentInvoice.transferReceiptPath = path;
        return { count: 1 };
      },
    );
    const result = await service.submitBankTransferReceipt(
      userId,
      invoiceId,
      file,
    );
    expect(repository.findInvoiceByIdForUser).toHaveBeenCalledWith(
      invoiceId,
      userId,
    );
    expect(storage.upload).toHaveBeenCalledWith(userId, invoiceId, file);
    expect(repository.updateBankTransferReceipt).toHaveBeenCalledWith(
      invoiceId,
      userId,
      "private/new-receipt.pdf",
    );
    expect(storage.remove).toHaveBeenCalledWith("private/receipt.pdf");
    expect(result).toMatchObject({
      status: "PENDING_VERIFICATION",
      hasTransferReceipt: true,
    });
    expectNoPaymentEffects();
  });

  test.each(["PAID", "FAILED", "EXPIRED"])(
    "does not upload to a %s invoice",
    async (status) => {
      currentInvoice.status = status;
      await expect(
        service.submitBankTransferReceipt(userId, invoiceId, file),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(storage.upload).not.toHaveBeenCalled();
    },
  );

  test("another user's or missing invoice cannot receive a receipt", async () => {
    repository.findInvoiceByIdForUser.mockResolvedValue(null);
    await expect(
      service.submitBankTransferReceipt(userId, invoiceId, file),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  test("expired invoice without a receipt is rejected before upload", async () => {
    currentInvoice.transferReceiptPath = null;
    currentInvoice.expiresAt = new Date(0);
    await expect(
      service.submitBankTransferReceipt(userId, invoiceId, file),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      repository.expireUnsubmittedBankTransferInvoice,
    ).toHaveBeenCalledWith(invoiceId, userId, expect.any(Date));
    expect(storage.upload).not.toHaveBeenCalled();
  });

  test.each(["concurrent review", "database error"])(
    "cleans up the new upload after %s and preserves the old receipt",
    async (scenario) => {
      if (scenario === "concurrent review")
        repository.updateBankTransferReceipt.mockResolvedValue({ count: 0 });
      else
        repository.updateBankTransferReceipt.mockRejectedValue(
          new Error("Database unavailable"),
        );
      await expect(
        service.submitBankTransferReceipt(userId, invoiceId, file),
      ).rejects.toThrow();
      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledWith("private/new-receipt.pdf");
      expectNoPaymentEffects();
    },
  );
});
