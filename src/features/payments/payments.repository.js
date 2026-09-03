const prisma = require("../../config/prisma");

const packageSelect = {
  id: true,
  name: true,
  tokenAmount: true,
  bonusTokens: true,
  priceNis: true,
  isActive: true,
};

const invoiceInclude = {
  tokenPackage: { select: packageSelect },
  walletTransaction: {
    select: {
      id: true,
      transactionType: true,
      tokenAmount: true,
      balanceBefore: true,
      balanceAfter: true,
      referenceType: true,
      referenceId: true,
      idempotencyKey: true,
      description: true,
      createdAt: true,
    },
  },
};

const listActivePackages = (client = prisma) =>
  client.tokenPackage.findMany({
    where: { isActive: true },
    orderBy: [{ priceNis: "asc" }, { tokenAmount: "asc" }],
    select: packageSelect,
  });

const findActivePackageById = (id, client = prisma) =>
  client.tokenPackage.findFirst({
    where: { id, isActive: true },
    select: packageSelect,
  });

const createInvoice = (data, client = prisma) =>
  client.paymentInvoice.create({ data, include: invoiceInclude });

const findInvoiceByClientRequestKey = (
  userId,
  clientRequestKey,
  client = prisma,
) =>
  client.paymentInvoice.findFirst({
    where: { userId, clientRequestKey },
    include: invoiceInclude,
  });

const findInvoiceByIdForUser = (id, userId, client = prisma) =>
  client.paymentInvoice.findFirst({
    where: { id, userId },
    include: invoiceInclude,
  });

const findInvoiceByProviderInvoiceId = (providerInvoiceId, client = prisma) =>
  client.paymentInvoice.findUnique({
    where: { providerInvoiceId },
    include: invoiceInclude,
  });

const listInvoicesForUser = (userId, { status, skip, take }, client = prisma) =>
  client.paymentInvoice.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    include: invoiceInclude,
  });

const countInvoicesForUser = (userId, { status }, client = prisma) =>
  client.paymentInvoice.count({
    where: { userId, ...(status ? { status } : {}) },
  });

const expirePendingInvoicesForUser = (userId, now, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: { userId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

const expirePendingInvoiceById = (id, now, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: { id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

const lockInvoiceByProviderInvoiceId = async (providerInvoiceId, client) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM payment_invoices
    WHERE provider_invoice_id = ${providerInvoiceId}
    FOR UPDATE
  `;

  return rows[0] || null;
};

const findPaymentTransactionByProviderId = (
  providerTransactionId,
  client = prisma,
) => client.paymentTransaction.findUnique({ where: { providerTransactionId } });

const createPaymentTransaction = (data, client = prisma) =>
  client.paymentTransaction.create({ data });

const updateInvoice = (id, data, client = prisma) =>
  client.paymentInvoice.update({
    where: { id },
    data,
    include: invoiceInclude,
  });

const createTopUpNotification = (userId, totalTokens, client = prisma) =>
  client.notification.create({
    data: {
      userId,
      notificationType: "WALLET_TOP_UP_SUCCESS",
      channel: "IN_APP",
      title: "Wallet top-up completed",
      message: `${totalTokens} tokens were added to your wallet.`,
      status: "PENDING",
    },
  });

module.exports = {
  listActivePackages,
  findActivePackageById,
  createInvoice,
  findInvoiceByClientRequestKey,
  findInvoiceByIdForUser,
  findInvoiceByProviderInvoiceId,
  listInvoicesForUser,
  countInvoicesForUser,
  expirePendingInvoicesForUser,
  expirePendingInvoiceById,
  lockInvoiceByProviderInvoiceId,
  findPaymentTransactionByProviderId,
  createPaymentTransaction,
  updateInvoice,
  createTopUpNotification,
};
