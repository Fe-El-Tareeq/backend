process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";

jest.mock("../src/config/env", () => ({
  mockPaymentEnabled: true,
  mockPaymentWebhookSecret: "phase-11-test-webhook-secret",
  mockPaymentOtpTestPhone: "+970599000000",
  mockPaymentOtpTestCode: "123456",
  mockPaymentProductionOtpTestEnabled: false,
  nodeEnv: "test",
}));
jest.mock("../src/config/prisma", () => ({ $transaction: jest.fn() }));
jest.mock("../src/features/payments/payments.repository");
jest.mock("../src/features/wallet/wallet.service");
jest.mock("../src/features/notifications/notifications.service");

const prisma = require("../src/config/prisma");
const env = require("../src/config/env");
const repository = require("../src/features/payments/payments.repository");
const walletService = require("../src/features/wallet/wallet.service");
const notificationService = require("../src/features/notifications/notifications.service");
const service = require("../src/features/payments/payments.service");
const {
  MockPaymentProvider,
} = require("../src/features/payments/providers/mockPaymentProvider");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const packageId = "650e8400-e29b-41d4-a716-446655440001";
const invoiceId = "750e8400-e29b-41d4-a716-446655440001";
const requestKey = "850e8400-e29b-41d4-a716-446655440001";
const tx = { transaction: "payment-test" };
const tokenPackage = {
  id: packageId,
  name: "Standard",
  tokenAmount: 25,
  bonusTokens: 3,
  priceNis: 12,
  isActive: true,
};
const invoice = {
  id: invoiceId,
  userId,
  clientRequestKey: requestKey,
  tokenPackageId: packageId,
  tokenAmount: 25,
  bonusTokens: 3,
  totalTokens: 28,
  amountNis: 12,
  paymentProvider: "MOCK",
  providerInvoiceId: `mock-invoice-${invoiceId}`,
  qrCodePayload: "feeltareeq://payments/mock",
  paymentUrl: null,
  status: "PENDING",
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  paidAt: null,
  failedAt: null,
  tokenPackage,
  walletTransaction: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  env.mockPaymentEnabled = true;
  env.mockPaymentProductionOtpTestEnabled = false;
  env.nodeEnv = "test";
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  notificationService.templates.paymentSuccess.mockResolvedValue({});
  notificationService.templates.paymentFailure.mockResolvedValue({});
});

test("does not create mock invoices when the mock flow is disabled", async () => {
  env.mockPaymentEnabled = false;
  await expect(
    service.createInvoice(userId, {
      tokenPackageId: packageId,
      clientRequestKey: requestKey,
    }),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(repository.createInvoice).not.toHaveBeenCalled();
});

test("lists active packages with totals and NIS currency", async () => {
  repository.listActivePackages.mockResolvedValue([tokenPackage]);
  await expect(service.listPackages()).resolves.toEqual([
    expect.objectContaining({ totalTokens: 28, priceNis: 12, currency: "NIS" }),
  ]);
});

test("creates OTP invoices for the test phone with the fixed demo code", async () => {
  repository.findInvoiceByClientRequestKey.mockResolvedValue(null);
  repository.findActivePackageById.mockResolvedValue(tokenPackage);
  repository.createInvoice.mockImplementation(async (data) => ({
    ...invoice,
    ...data,
    tokenPackage,
  }));

  const result = await service.createInvoice(userId, {
    tokenPackageId: packageId,
    clientRequestKey: requestKey,
    paymentMethod: "OTP",
    paymentPhone: "0599000000",
  });

  expect(result.created).toBe(true);
  expect(result.mockOtp).toBe("123456");
  expect(repository.createInvoice).toHaveBeenCalledWith(
    expect.objectContaining({
      paymentMethod: "OTP",
      paymentPhone: "0599000000",
      otpHash: expect.any(String),
      otpAttempts: 0,
    }),
  );
  expect(repository.createInvoice.mock.calls[0][0].otpHash).not.toBe("123456");
});

test("fixed OTP verifies the invoice and credits the wallet once", async () => {
  const crypto = require("crypto");
  const otpInvoice = {
    ...invoice,
    paymentMethod: "OTP",
    paymentPhone: "0599000000",
    otpHash: crypto.createHmac("sha256", env.mockPaymentWebhookSecret)
      .update(`${invoiceId}:123456`).digest("hex"),
    otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    otpAttempts: 0,
  };
  repository.expirePendingInvoiceById.mockResolvedValue({ count: 0 });
  repository.findInvoiceByIdForUser.mockResolvedValue(otpInvoice);
  repository.incrementOtpAttempts.mockResolvedValue({ count: 1 });
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({ id: invoiceId });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(otpInvoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.createPaymentTransaction.mockResolvedValue({});
  walletService.credit.mockResolvedValue({ id: "ledger-otp-1" });
  repository.updateInvoice.mockResolvedValue({ ...otpInvoice, status: "PAID", paidAt: new Date() });

  await expect(service.verifyMockPaymentOtp(userId, invoiceId, "000000"))
    .rejects.toMatchObject({ statusCode: 401 });
  expect(prisma.$transaction).not.toHaveBeenCalled();

  const result = await service.verifyMockPaymentOtp(userId, invoiceId, "123456");
  expect(result.reason).toBe("PAYMENT_COMPLETED");
  expect(walletService.credit).toHaveBeenCalledTimes(1);
  expect(walletService.credit).toHaveBeenCalledWith(expect.objectContaining({
    userId, amount: 28, paymentInvoiceId: invoiceId,
  }));
  expect(repository.updateInvoice).toHaveBeenCalledWith(invoiceId,
    expect.objectContaining({ status: "PAID", otpVerifiedAt: expect.any(Date) }), tx);
});

test("production OTP is limited to the registered test account and hides the code", async () => {
  env.nodeEnv = "production";
  env.mockPaymentProductionOtpTestEnabled = true;
  repository.findUserPhoneById.mockResolvedValue({ phone: "+970599000000" });
  repository.findInvoiceByClientRequestKey.mockResolvedValue(null);
  repository.findActivePackageById.mockResolvedValue(tokenPackage);
  repository.createInvoice.mockImplementation(async (data) => ({
    ...invoice,
    ...data,
    tokenPackage,
  }));

  const result = await service.createInvoice(userId, {
    tokenPackageId: packageId,
    clientRequestKey: requestKey,
    paymentMethod: "OTP",
    paymentPhone: "0599000000",
  });

  expect(result.mockOtp).toBeUndefined();
  expect(repository.createInvoice).toHaveBeenCalled();
  await expect(
    service.createInvoice(userId, {
      tokenPackageId: packageId,
      clientRequestKey: requestKey,
      paymentMethod: "OTP",
      paymentPhone: "+970599111111",
    }),
  ).rejects.toMatchObject({ statusCode: 404 });
});

test("production public mock webhook remains disabled", async () => {
  env.nodeEnv = "production";
  await expect(
    service.processMockWebhook({}, "bad-signature"),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("creates an immutable package snapshot and mock QR invoice", async () => {
  repository.findInvoiceByClientRequestKey.mockResolvedValue(null);
  repository.findActivePackageById.mockResolvedValue(tokenPackage);
  repository.createInvoice.mockImplementation(async (data) => ({
    ...invoice,
    ...data,
    tokenPackage,
  }));

  const result = await service.createInvoice(userId, {
    tokenPackageId: packageId,
    clientRequestKey: requestKey,
  });

  expect(result.created).toBe(true);
  expect(repository.createInvoice).toHaveBeenCalledWith(
    expect.objectContaining({
      userId,
      clientRequestKey: requestKey,
      tokenAmount: 25,
      bonusTokens: 3,
      totalTokens: 28,
      amountNis: 12,
      paymentProvider: "MOCK",
      status: "PENDING",
    }),
  );
  expect(result.invoice.qrCodePayload).toContain("feeltareeq://payments/mock");
});

test("returns the same invoice for an idempotent create retry", async () => {
  repository.findInvoiceByClientRequestKey.mockResolvedValue(invoice);
  const result = await service.createInvoice(userId, {
    tokenPackageId: packageId,
    clientRequestKey: requestKey,
  });
  expect(result.created).toBe(false);
  expect(repository.createInvoice).not.toHaveBeenCalled();
});

test("rejects reusing a request key for a different package", async () => {
  repository.findInvoiceByClientRequestKey.mockResolvedValue(invoice);
  await expect(
    service.createInvoice(userId, {
      tokenPackageId: "650e8400-e29b-41d4-a716-446655440099",
      clientRequestKey: requestKey,
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("a valid signed webhook credits the wallet and pays the invoice atomically", async () => {
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const { payload, signature } = provider.createSuccessfulWebhook(invoice);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({
    id: invoiceId,
  });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(invoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.createPaymentTransaction.mockResolvedValue({});
  walletService.credit.mockResolvedValue({ id: "ledger-1" });
  repository.updateInvoice.mockResolvedValue({
    ...invoice,
    status: "PAID",
    paidAt: new Date(),
  });

  const result = await service.processMockWebhook(payload, signature);

  expect(result.reason).toBe("PAYMENT_COMPLETED");
  expect(walletService.credit).toHaveBeenCalledWith(
    expect.objectContaining({
      userId,
      amount: 28,
      transactionType: "TOKEN_TOP_UP",
      paymentInvoiceId: invoiceId,
      client: tx,
    }),
  );
  expect(repository.updateInvoice).toHaveBeenCalledWith(
    invoiceId,
    expect.objectContaining({ status: "PAID" }),
    tx,
  );
  expect(notificationService.templates.paymentSuccess).toHaveBeenCalledWith(
    {
      userId,
      invoiceId,
      totalTokens: 28,
    },
    tx,
  );
});

test("payment notification failure rejects the top-up transaction", async () => {
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const { payload, signature } = provider.createSuccessfulWebhook(invoice);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({ id: invoiceId });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(invoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.createPaymentTransaction.mockResolvedValue({});
  walletService.credit.mockResolvedValue({ id: "wallet-transaction" });
  notificationService.templates.paymentSuccess.mockRejectedValue(
    new Error("notification write failed"),
  );

  await expect(service.processMockWebhook(payload, signature)).rejects.toThrow(
    "notification write failed",
  );
  expect(repository.updateInvoice).not.toHaveBeenCalledWith(
    invoiceId,
    expect.objectContaining({ status: "PAID" }),
    tx,
  );
});

test("rejects an invalid webhook signature before database access", async () => {
  await expect(
    service.processMockWebhook(
      {
        providerInvoiceId: invoice.providerInvoiceId,
        providerTransactionId: "mock-transaction-invalid",
        status: "SUCCESS",
        amountPaidNis: 12,
        providerTimestamp: new Date().toISOString(),
      },
      "bad-signature",
    ),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("a duplicate provider transaction never credits the wallet twice", async () => {
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const { payload, signature } = provider.createSuccessfulWebhook(invoice);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({
    id: invoiceId,
  });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(invoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue({
    invoiceId,
    providerTransactionId: payload.providerTransactionId,
  });

  const result = await service.processMockWebhook(payload, signature);
  expect(result.reason).toBe("DUPLICATE_WEBHOOK");
  expect(walletService.credit).not.toHaveBeenCalled();
  expect(notificationService.templates.paymentSuccess).not.toHaveBeenCalled();
  expect(notificationService.templates.paymentFailure).not.toHaveBeenCalled();
});

test("a paid invoice ignores a new webhook transaction without another credit", async () => {
  const paidInvoice = { ...invoice, status: "PAID", paidAt: new Date() };
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const { payload, signature } = provider.createSuccessfulWebhook(paidInvoice);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({ id: invoiceId });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(paidInvoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);

  const result = await service.processMockWebhook(payload, signature);
  expect(result.reason).toBe("INVOICE_ALREADY_PAID");
  expect(repository.createPaymentTransaction).not.toHaveBeenCalled();
  expect(walletService.credit).not.toHaveBeenCalled();
});

test("an amount mismatch fails the invoice without crediting tokens", async () => {
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const payload = {
    providerInvoiceId: invoice.providerInvoiceId,
    providerTransactionId: "mock-transaction-wrong-amount",
    status: "SUCCESS",
    amountPaidNis: 11,
    providerTimestamp: new Date().toISOString(),
  };
  const signature = provider.signWebhook(payload);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({
    id: invoiceId,
  });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(invoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.updateInvoice.mockResolvedValue({ ...invoice, status: "FAILED" });

  const result = await service.processMockWebhook(payload, signature);
  expect(result.reason).toBe("AMOUNT_MISMATCH");
  expect(walletService.credit).not.toHaveBeenCalled();
  expect(notificationService.templates.paymentFailure).toHaveBeenCalledWith(
    {
      userId,
      invoiceId,
      reason: "AMOUNT_MISMATCH",
    },
    tx,
  );
});

test("a provider-reported failed payment creates a failure notification", async () => {
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const payload = {
    providerInvoiceId: invoice.providerInvoiceId,
    providerTransactionId: "mock-transaction-failed",
    status: "FAILED",
    amountPaidNis: 0,
    providerTimestamp: new Date().toISOString(),
    failureReason: "Insufficient funds",
  };
  const signature = provider.signWebhook(payload);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({
    id: invoiceId,
  });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(invoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.updateInvoice.mockResolvedValue({ ...invoice, status: "FAILED" });

  const result = await service.processMockWebhook(payload, signature);

  expect(result.reason).toBe("PAYMENT_FAILED");
  expect(walletService.credit).not.toHaveBeenCalled();
  expect(notificationService.templates.paymentFailure).toHaveBeenCalledWith(
    {
      userId,
      invoiceId,
      reason: "PAYMENT_FAILED",
    },
    tx,
  );
});

test("an expired invoice records failure and never credits the wallet", async () => {
  const expiredInvoice = {
    ...invoice,
    expiresAt: new Date(Date.now() - 1000),
  };
  const provider = new MockPaymentProvider("phase-11-test-webhook-secret");
  const { payload, signature } = provider.createSuccessfulWebhook(expiredInvoice);
  repository.lockInvoiceByProviderInvoiceId.mockResolvedValue({ id: invoiceId });
  repository.findInvoiceByProviderInvoiceId.mockResolvedValue(expiredInvoice);
  repository.findPaymentTransactionByProviderId.mockResolvedValue(null);
  repository.updateInvoice.mockResolvedValue({
    ...expiredInvoice,
    status: "EXPIRED",
  });

  const result = await service.processMockWebhook(payload, signature);
  expect(result.reason).toBe("INVOICE_EXPIRED");
  expect(repository.createPaymentTransaction).toHaveBeenCalledWith(
    expect.objectContaining({ status: "FAILED", failureReason: "Invoice expired." }),
    tx,
  );
  expect(walletService.credit).not.toHaveBeenCalled();
});

test("invoice lookup does not reveal another user's invoice", async () => {
  repository.expirePendingInvoiceById.mockResolvedValue({ count: 0 });
  repository.findInvoiceByIdForUser.mockResolvedValue(null);
  await expect(service.getInvoice(userId, invoiceId)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(repository.findInvoiceByIdForUser).toHaveBeenCalledWith(
    invoiceId,
    userId,
  );
});
