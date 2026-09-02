const crypto = require("crypto");

const prisma = require("../../config/prisma");
const env = require("../../config/env");
const ApiError = require("../../utils/ApiError");
const walletService = require("../wallet/wallet.service");
const repository = require("./payments.repository");
const {
  INVOICE_EXPIRY_MINUTES,
  MOCK_PROVIDER,
} = require("./payments.constants");
const { MockPaymentProvider } = require("./providers/mockPaymentProvider");

const mockProvider = new MockPaymentProvider(env.mockPaymentWebhookSecret);

const ensureMockFlowAvailable = () => {
  if (!env.mockPaymentEnabled) {
    throw new ApiError(404, "Mock payment flow is not available.");
  }
  mockProvider.requireSecret();
};

const money = (value) => Number(value);
const moneyInAgorot = (value) => Math.round(money(value) * 100);

const formatPackage = (tokenPackage) => ({
  ...tokenPackage,
  priceNis: money(tokenPackage.priceNis),
  totalTokens: tokenPackage.tokenAmount + tokenPackage.bonusTokens,
  currency: "NIS",
});

const formatInvoice = (invoice) => ({
  id: invoice.id,
  clientRequestKey: invoice.clientRequestKey,
  tokenPackageId: invoice.tokenPackageId,
  tokenAmount: invoice.tokenAmount,
  bonusTokens: invoice.bonusTokens,
  totalTokens: invoice.totalTokens,
  amountNis: money(invoice.amountNis),
  currency: "NIS",
  paymentProvider: invoice.paymentProvider,
  providerInvoiceId: invoice.providerInvoiceId,
  qrCodePayload: invoice.qrCodePayload,
  paymentUrl: invoice.paymentUrl,
  status: invoice.status,
  createdAt: invoice.createdAt,
  expiresAt: invoice.expiresAt,
  paidAt: invoice.paidAt,
  failedAt: invoice.failedAt,
  tokenPackage: invoice.tokenPackage
    ? formatPackage(invoice.tokenPackage)
    : undefined,
  walletTransaction: invoice.walletTransaction || null,
});

const ensureSameInvoiceRequest = (invoice, tokenPackageId) => {
  if (invoice.tokenPackageId !== tokenPackageId) {
    throw new ApiError(
      409,
      "Client request key was already used for a different token package.",
    );
  }
};

const listPackages = async () =>
  (await repository.listActivePackages()).map(formatPackage);

const createInvoice = async (userId, { tokenPackageId, clientRequestKey }) => {
  ensureMockFlowAvailable();

  const existing = await repository.findInvoiceByClientRequestKey(
    userId,
    clientRequestKey,
  );

  if (existing) {
    ensureSameInvoiceRequest(existing, tokenPackageId);
    return { created: false, invoice: formatInvoice(existing) };
  }

  const tokenPackage = await repository.findActivePackageById(tokenPackageId);
  if (!tokenPackage) {
    throw new ApiError(404, "Active token package was not found.");
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + INVOICE_EXPIRY_MINUTES * 60 * 1000,
  );
  const providerData = mockProvider.createPayment({
    id,
    amountNis: tokenPackage.priceNis,
  });

  try {
    const invoice = await repository.createInvoice({
      id,
      userId,
      clientRequestKey,
      tokenPackageId: tokenPackage.id,
      tokenAmount: tokenPackage.tokenAmount,
      bonusTokens: tokenPackage.bonusTokens,
      totalTokens: tokenPackage.tokenAmount + tokenPackage.bonusTokens,
      amountNis: tokenPackage.priceNis,
      paymentProvider: MOCK_PROVIDER,
      providerInvoiceId: providerData.providerInvoiceId,
      qrCodePayload: providerData.qrCodePayload,
      paymentUrl: providerData.paymentUrl,
      status: "PENDING",
      createdAt,
      expiresAt,
    });

    return { created: true, invoice: formatInvoice(invoice) };
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const repeated = await repository.findInvoiceByClientRequestKey(
      userId,
      clientRequestKey,
    );
    if (!repeated) {
      throw error;
    }

    ensureSameInvoiceRequest(repeated, tokenPackageId);
    return { created: false, invoice: formatInvoice(repeated) };
  }
};

const refreshInvoiceExpiry = async (id, userId) => {
  await repository.expirePendingInvoiceById(id, new Date());
  const invoice = await repository.findInvoiceByIdForUser(id, userId);
  if (!invoice) {
    throw new ApiError(404, "Payment invoice was not found.");
  }
  return invoice;
};

const getInvoice = async (userId, id) =>
  formatInvoice(await refreshInvoiceExpiry(id, userId));

const listInvoices = async (userId, options) => {
  await repository.expirePendingInvoicesForUser(userId, new Date());
  const [invoices, total] = await Promise.all([
    repository.listInvoicesForUser(userId, options),
    repository.countInvoicesForUser(userId, options),
  ]);

  return {
    invoices: invoices.map(formatInvoice),
    pagination: { skip: options.skip, take: options.take, total },
  };
};

const createFailedTransactionData = (invoice, payload, failureReason) => ({
  invoiceId: invoice.id,
  providerTransactionId: payload.providerTransactionId,
  provider: MOCK_PROVIDER,
  amountPaidNis: payload.amountPaidNis,
  status: "FAILED",
  signatureVerified: true,
  webhookPayload: payload,
  failureReason,
  providerTimestamp: new Date(payload.providerTimestamp),
});

const processMockWebhook = async (payload, signature) => {
  ensureMockFlowAvailable();

  if (!mockProvider.verifyWebhookSignature(payload, signature)) {
    throw new ApiError(401, "Invalid payment webhook signature.");
  }

  return prisma.$transaction(async (tx) => {
    const locked = await repository.lockInvoiceByProviderInvoiceId(
      payload.providerInvoiceId,
      tx,
    );
    if (!locked) {
      throw new ApiError(404, "Payment invoice was not found.");
    }

    const invoice = await repository.findInvoiceByProviderInvoiceId(
      payload.providerInvoiceId,
      tx,
    );
    if (invoice.paymentProvider !== MOCK_PROVIDER) {
      throw new ApiError(409, "Payment provider does not match the invoice.");
    }

    const repeated = await repository.findPaymentTransactionByProviderId(
      payload.providerTransactionId,
      tx,
    );
    if (repeated) {
      if (repeated.invoiceId !== invoice.id) {
        throw new ApiError(
          409,
          "Provider transaction ID belongs to another invoice.",
        );
      }
      return { processed: false, reason: "DUPLICATE_WEBHOOK", invoice };
    }

    if (invoice.status === "PAID") {
      return { processed: false, reason: "INVOICE_ALREADY_PAID", invoice };
    }

    if (invoice.status !== "PENDING") {
      return {
        processed: false,
        reason: `INVOICE_${invoice.status}`,
        invoice,
      };
    }

    if (invoice.expiresAt <= new Date()) {
      await repository.createPaymentTransaction(
        createFailedTransactionData(invoice, payload, "Invoice expired."),
        tx,
      );
      const expired = await repository.updateInvoice(
        invoice.id,
        { status: "EXPIRED" },
        tx,
      );
      return { processed: false, reason: "INVOICE_EXPIRED", invoice: expired };
    }

    if (payload.status === "FAILED") {
      await repository.createPaymentTransaction(
        createFailedTransactionData(
          invoice,
          payload,
          payload.failureReason || "Provider reported a failed payment.",
        ),
        tx,
      );
      const failed = await repository.updateInvoice(
        invoice.id,
        { status: "FAILED", failedAt: new Date() },
        tx,
      );
      return { processed: true, reason: "PAYMENT_FAILED", invoice: failed };
    }

    if (
      moneyInAgorot(invoice.amountNis) !==
      moneyInAgorot(payload.amountPaidNis)
    ) {
      await repository.createPaymentTransaction(
        createFailedTransactionData(
          invoice,
          payload,
          "Payment amount mismatch.",
        ),
        tx,
      );
      const failed = await repository.updateInvoice(
        invoice.id,
        { status: "FAILED", failedAt: new Date() },
        tx,
      );
      return { processed: true, reason: "AMOUNT_MISMATCH", invoice: failed };
    }

    await repository.createPaymentTransaction(
      {
        invoiceId: invoice.id,
        providerTransactionId: payload.providerTransactionId,
        provider: MOCK_PROVIDER,
        amountPaidNis: payload.amountPaidNis,
        status: "SUCCESS",
        signatureVerified: true,
        webhookPayload: payload,
        providerTimestamp: new Date(payload.providerTimestamp),
      },
      tx,
    );

    await walletService.credit({
      userId: invoice.userId,
      amount: invoice.totalTokens,
      transactionType: "TOKEN_TOP_UP",
      referenceType: "PAYMENT_INVOICE",
      referenceId: invoice.id,
      idempotencyKey: `payment-invoice:${invoice.id}`,
      paymentInvoiceId: invoice.id,
      description: `Token package top-up: ${invoice.tokenPackage.name}`,
      client: tx,
    });

    await repository.createTopUpNotification(
      invoice.userId,
      invoice.totalTokens,
      tx,
    );

    const paid = await repository.updateInvoice(
      invoice.id,
      { status: "PAID", paidAt: new Date() },
      tx,
    );
    return { processed: true, reason: "PAYMENT_COMPLETED", invoice: paid };
  });
};

const simulateMockPayment = async (userId, id) => {
  ensureMockFlowAvailable();

  const invoice = await refreshInvoiceExpiry(id, userId);
  if (invoice.status === "PAID") {
    return {
      processed: false,
      reason: "INVOICE_ALREADY_PAID",
      invoice: formatInvoice(invoice),
    };
  }
  if (invoice.status !== "PENDING") {
    throw new ApiError(409, `Invoice is ${invoice.status}.`);
  }

  const webhook = mockProvider.createSuccessfulWebhook(invoice);
  const result = await processMockWebhook(webhook.payload, webhook.signature);
  return { ...result, invoice: formatInvoice(result.invoice) };
};

module.exports = {
  listPackages,
  createInvoice,
  getInvoice,
  listInvoices,
  processMockWebhook,
  simulateMockPayment,
  formatInvoice,
};
