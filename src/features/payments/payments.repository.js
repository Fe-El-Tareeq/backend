const prisma = require("../../config/prisma");

const packageSelect = {
  id: true,
  name: true,
  tokenAmount: true,
  bonusTokens: true,
  priceNis: true,
  discountPercentage: true,
  features: true,
  savingsText: true,
  hasSearchPriority: true,
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

const findUserPhoneById = (userId, client = prisma) =>
  client.user.findUnique({
    where: { id: userId },
    select: { phone: true },
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
    where: {
      userId,
      expiresAt: { lte: now },
      OR: [
        { status: "PENDING" },
        {
          paymentMethod: "BANK_TRANSFER",
          status: "PENDING_VERIFICATION",
          transferReceiptPath: null,
        },
      ],
    },
    data: { status: "EXPIRED" },
  });

const expirePendingInvoiceById = (id, now, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      expiresAt: { lte: now },
      OR: [
        { status: "PENDING" },
        {
          paymentMethod: "BANK_TRANSFER",
          status: "PENDING_VERIFICATION",
          transferReceiptPath: null,
        },
      ],
    },
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

const incrementOtpAttempts = (
  id,
  maxAttempts,
  expectedOtpHash,
  client = prisma,
) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      paymentMethod: "OTP",
      status: "PENDING",
      otpHash: expectedOtpHash,
      otpAttempts: { lt: maxAttempts },
    },
    data: { otpAttempts: { increment: 1 } },
  });

const replaceOtpChallenge = (id, previousOtpSentAt, data, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      paymentMethod: "OTP",
      status: "PENDING",
      otpSentAt: previousOtpSentAt,
    },
    data,
  });

const updateInvoice = (id, data, client = prisma) =>
  client.paymentInvoice.update({
    where: { id },
    data,
    include: invoiceInclude,
  });

const bankInvoiceAdminInclude = {
  tokenPackage: { select: packageSelect },
  user: { select: { id: true, fullName: true, phone: true } },
};

const listBankTransferInvoices = ({ status, skip, take }, client = prisma) =>
  client.paymentInvoice.findMany({
    where: {
      paymentMethod: "BANK_TRANSFER",
      status,
      transferReceiptPath: { not: null },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip,
    take,
    include: bankInvoiceAdminInclude,
  });

const countBankTransferInvoices = (status, client = prisma) =>
  client.paymentInvoice.count({
    where: {
      paymentMethod: "BANK_TRANSFER",
      status,
      transferReceiptPath: { not: null },
    },
  });

const lockBankTransferInvoice = async (id, client) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM payment_invoices
    WHERE id = ${id}
    FOR UPDATE
  `;
  return rows[0] || null;
};

const findBankTransferInvoiceById = (id, client = prisma) =>
  client.paymentInvoice.findUnique({
    where: { id },
    include: bankInvoiceAdminInclude,
  });

const claimBankTransferInvoice = (id, expectedStatus, data, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      paymentMethod: "BANK_TRANSFER",
      status: expectedStatus,
      transferReceiptPath: { not: null },
    },
    data,
  });

const expireUnsubmittedBankTransferInvoice = (
  id,
  userId,
  now,
  client = prisma,
) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      userId,
      paymentMethod: "BANK_TRANSFER",
      status: "PENDING_VERIFICATION",
      transferReceiptPath: null,
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

const updateBankTransferReceipt = (id, userId, path, client = prisma) =>
  client.paymentInvoice.updateMany({
    where: {
      id,
      userId,
      paymentMethod: "BANK_TRANSFER",
      status: "PENDING_VERIFICATION",
    },
    data: { transferReceiptPath: path },
  });

const createAdminAuditLog = (data, client = prisma) =>
  client.adminAuditLog.create({ data });
module.exports = {
  listActivePackages,
  findUserPhoneById,
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
  incrementOtpAttempts,
  replaceOtpChallenge,
  updateBankTransferReceipt,
  expireUnsubmittedBankTransferInvoice,
  listBankTransferInvoices,
  countBankTransferInvoices,
  lockBankTransferInvoice,
  findBankTransferInvoiceById,
  claimBankTransferInvoice,
  createAdminAuditLog,
  updateInvoice,
};
