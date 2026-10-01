const crypto = require("crypto");

const prisma = require("../../config/prisma");
const env = require("../../config/env");
const ApiError = require("../../utils/ApiError");
const notificationService = require("../notifications/notifications.service");
const walletService = require("../wallet/wallet.service");
const repository = require("./payments.repository");
const {
  INVOICE_EXPIRY_MINUTES,
  PAYMENT_OTP_EXPIRY_MINUTES,
  PAYMENT_OTP_MAX_ATTEMPTS,
  PAYMENT_OTP_RESEND_SECONDS,
  MOCK_PROVIDER,
  BANK_TRANSFER_METHOD,
  BANK_TRANSFER_PROVIDER,
} = require("./payments.constants");
const paymentReceiptStorage = require("./paymentReceipt.storage");
const { MockPaymentProvider } = require("./providers/mockPaymentProvider");

const mockProvider = new MockPaymentProvider(env.mockPaymentWebhookSecret);

const ensureMockFlowAvailable = ({ allowProductionOtpTest = false } = {}) => {
  if (
    !env.mockPaymentEnabled ||
    (env.nodeEnv === "production" && !allowProductionOtpTest)
  ) {
    throw new ApiError(404, "Mock payment flow is not available.");
  }
  mockProvider.requireSecret();
};

const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00970")) return digits.slice(2);
  if (digits.startsWith("0")) return "970" + digits.slice(1);
  return digits;
};
const isConfiguredOtpTestPhone = (phone) =>
  normalizePhone(phone) === normalizePhone(env.mockPaymentOtpTestPhone);
const canUseProductionOtpTest = async (userId, phone) => {
  if (
    !env.mockPaymentProductionOtpTestEnabled ||
    !isConfiguredOtpTestPhone(phone)
  )
    return false;
  const user = await repository.findUserPhoneById(userId);
  return Boolean(user && isConfiguredOtpTestPhone(user.phone));
};

const getBankTransferDetails = () => {
  const {
    bankTransferBeneficiaryName,
    bankTransferAccountNumber,
    bankTransferIban,
    bankTransferBankName,
  } = env;
  if (
    !bankTransferBeneficiaryName ||
    (!bankTransferAccountNumber && !bankTransferIban) ||
    !bankTransferBankName
  ) {
    throw new ApiError(
      503,
      "Bank transfer account details are not configured.",
    );
  }
  return {
    beneficiaryName: bankTransferBeneficiaryName,
    accountNumber: bankTransferAccountNumber,
    iban: bankTransferIban,
    bankName: bankTransferBankName,
  };
};

const generateBankTransferReferenceCode = (date = new Date()) =>
  "ORD-" +
  date.getTime().toString(36).toUpperCase() +
  "-" +
  crypto.randomBytes(5).toString("hex").toUpperCase();

const money = (value) => Number(value);
const moneyInAgorot = (value) => Math.round(money(value) * 100);

const formatPackage = (tokenPackage) => ({
  ...tokenPackage,
  priceNis: money(tokenPackage.priceNis),
  totalTokens: tokenPackage.tokenAmount + tokenPackage.bonusTokens,
  currency: "NIS",
});

const generatePaymentOtp = (phone) =>
  isConfiguredOtpTestPhone(phone)
    ? env.mockPaymentOtpTestCode
    : String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const hashPaymentOtp = (invoiceId, otp) =>
  crypto
    .createHmac("sha256", env.mockPaymentWebhookSecret)
    .update(`${invoiceId}:${otp}`)
    .digest("hex");

const verifyPaymentOtpHash = (invoiceId, otp, storedHash) => {
  const expected = Buffer.from(hashPaymentOtp(invoiceId, otp), "hex");
  const actual = Buffer.from(storedHash || "", "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
};

const maskPhone = (phone) =>
  phone
    ? `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
    : null;

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
  paymentMethod: invoice.paymentMethod || "QR",
  referenceCode: invoice.referenceCode || null,
  hasTransferReceipt: Boolean(invoice.transferReceiptPath),
  rejectionNotes: invoice.rejectionNotes || null,
  reviewedAt: invoice.reviewedAt || null,
  paymentPhone: maskPhone(invoice.paymentPhone),
  otpExpiresAt: invoice.otpExpiresAt || null,
  otpResendAvailableAt: invoice.otpSentAt
    ? new Date(invoice.otpSentAt.getTime() + PAYMENT_OTP_RESEND_SECONDS * 1000)
    : null,
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

const ensureSameInvoiceRequest = (
  invoice,
  tokenPackageId,
  paymentMethod,
  paymentPhone,
) => {
  if (
    invoice.tokenPackageId !== tokenPackageId ||
    (invoice.paymentMethod || "QR") !== paymentMethod ||
    (paymentMethod === "OTP" && invoice.paymentPhone !== paymentPhone)
  ) {
    throw new ApiError(
      409,
      "Client request key was already used with different payment data.",
    );
  }
};

const debugOtpFields = (otp) =>
  env.nodeEnv !== "production" && otp ? { mockOtp: otp } : {};

const listPackages = async () =>
  (await repository.listActivePackages()).map(formatPackage);

const createInvoice = async (
  userId,
  {
    tokenPackageId,
    clientRequestKey,
    paymentMethod = "QR",
    paymentPhone = null,
  },
) => {
  const supportedMethods = ["QR", "OTP", BANK_TRANSFER_METHOD];
  if (!supportedMethods.includes(paymentMethod))
    throw new ApiError(400, "Unsupported payment method.");
  const isBankTransfer = paymentMethod === BANK_TRANSFER_METHOD;
  if (paymentMethod === "OTP" && !paymentPhone)
    throw new ApiError(400, "A phone number is required for OTP payment.");
  if (paymentMethod !== "OTP" && paymentPhone)
    throw new ApiError(400, "A phone number is only accepted for OTP payment.");
  const normalizedPhone = paymentMethod === "OTP" ? paymentPhone.trim() : null;
  const allowProductionOtpTest =
    paymentMethod === "OTP" &&
    (await canUseProductionOtpTest(userId, normalizedPhone));
  if (!isBankTransfer) ensureMockFlowAvailable({ allowProductionOtpTest });
  const bankAccount = isBankTransfer ? getBankTransferDetails() : null;

  const existing = await repository.findInvoiceByClientRequestKey(
    userId,
    clientRequestKey,
  );
  if (existing) {
    ensureSameInvoiceRequest(
      existing,
      tokenPackageId,
      paymentMethod,
      normalizedPhone,
    );
    return {
      created: false,
      invoice: formatInvoice(existing),
      ...(bankAccount ? { bankAccount } : {}),
    };
  }

  const tokenPackage = await repository.findActivePackageById(tokenPackageId);
  if (!tokenPackage)
    throw new ApiError(404, "Active token package was not found.");

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() +
      (isBankTransfer
        ? 72 * 60 * 60 * 1000
        : INVOICE_EXPIRY_MINUTES * 60 * 1000),
  );
  const otp =
    paymentMethod === "OTP" ? generatePaymentOtp(normalizedPhone) : null;
  const otpSentAt = otp ? createdAt : null;
  const otpExpiresAt = otp
    ? new Date(createdAt.getTime() + PAYMENT_OTP_EXPIRY_MINUTES * 60 * 1000)
    : null;
  const providerData = isBankTransfer
    ? null
    : mockProvider.createPayment(
        { id, amountNis: tokenPackage.priceNis, expiresAt },
        paymentMethod,
      );
  const referenceCode = isBankTransfer
    ? generateBankTransferReferenceCode(createdAt)
    : null;

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
      paymentProvider: isBankTransfer ? BANK_TRANSFER_PROVIDER : MOCK_PROVIDER,
      paymentMethod,
      paymentPhone: normalizedPhone,
      referenceCode,
      otpHash: otp ? hashPaymentOtp(id, otp) : null,
      otpExpiresAt,
      otpAttempts: 0,
      otpSentAt,
      providerInvoiceId: providerData?.providerInvoiceId || null,
      qrCodePayload: providerData?.qrCodePayload || null,
      paymentUrl: providerData?.paymentUrl || null,
      status: isBankTransfer ? "PENDING_VERIFICATION" : "PENDING",
      createdAt,
      expiresAt,
    });
    return {
      created: true,
      invoice: formatInvoice(invoice),
      ...(bankAccount ? { bankAccount } : {}),
      ...debugOtpFields(otp),
    };
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const repeated = await repository.findInvoiceByClientRequestKey(
      userId,
      clientRequestKey,
    );
    if (!repeated) throw error;
    ensureSameInvoiceRequest(
      repeated,
      tokenPackageId,
      paymentMethod,
      normalizedPhone,
    );
    return {
      created: false,
      invoice: formatInvoice(repeated),
      ...(bankAccount ? { bankAccount } : {}),
    };
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

const processMockWebhook = async (
  payload,
  signature,
  { allowProductionOtpInvoiceId = null } = {},
) => {
  ensureMockFlowAvailable({
    allowProductionOtpTest: Boolean(allowProductionOtpInvoiceId),
  });

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
    if (
      env.nodeEnv === "production" &&
      allowProductionOtpInvoiceId &&
      (invoice.id !== allowProductionOtpInvoiceId ||
        invoice.paymentMethod !== "OTP" ||
        !isConfiguredOtpTestPhone(invoice.paymentPhone))
    ) {
      throw new ApiError(404, "Payment invoice was not found.");
    }
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
      await notificationService.templates.paymentFailure(
        {
          userId: invoice.userId,
          invoiceId: invoice.id,
          reason: "PAYMENT_FAILED",
        },
        tx,
      );
      return { processed: true, reason: "PAYMENT_FAILED", invoice: failed };
    }

    if (
      moneyInAgorot(invoice.amountNis) !== moneyInAgorot(payload.amountPaidNis)
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
      await notificationService.templates.paymentFailure(
        {
          userId: invoice.userId,
          invoiceId: invoice.id,
          reason: "AMOUNT_MISMATCH",
        },
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

    await notificationService.templates.paymentSuccess(
      {
        userId: invoice.userId,
        invoiceId: invoice.id,
        totalTokens: invoice.totalTokens,
      },
      tx,
    );

    const paid = await repository.updateInvoice(
      invoice.id,
      {
        status: "PAID",
        paidAt: new Date(),
        ...(invoice.paymentMethod === "OTP"
          ? { otpVerifiedAt: new Date() }
          : {}),
      },
      tx,
    );
    return { processed: true, reason: "PAYMENT_COMPLETED", invoice: paid };
  });
};

const simulateMockPayment = async (userId, id) => {
  ensureMockFlowAvailable();

  const invoice = await refreshInvoiceExpiry(id, userId);
  if (invoice.paymentMethod !== "QR") {
    throw new ApiError(409, "Use OTP verification for this invoice.");
  }
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

const ensureOtpInvoice = (invoice) => {
  if (invoice.paymentMethod !== "OTP") {
    throw new ApiError(409, "This invoice does not use OTP payment.");
  }
};

const resendMockPaymentOtp = async (userId, id) => {
  const invoice = await refreshInvoiceExpiry(id, userId);
  ensureOtpInvoice(invoice);
  ensureMockFlowAvailable({
    allowProductionOtpTest: await canUseProductionOtpTest(
      userId,
      invoice.paymentPhone,
    ),
  });
  if (invoice.status !== "PENDING") {
    throw new ApiError(409, `Invoice is ${invoice.status}.`);
  }

  const now = new Date();
  const resendAt = invoice.otpSentAt
    ? new Date(invoice.otpSentAt.getTime() + PAYMENT_OTP_RESEND_SECONDS * 1000)
    : now;
  if (now < resendAt) {
    throw new ApiError(429, "Please wait before requesting another OTP.");
  }

  const otp = generatePaymentOtp(invoice.paymentPhone);
  const result = await repository.replaceOtpChallenge(id, invoice.otpSentAt, {
    otpHash: hashPaymentOtp(id, otp),
    otpExpiresAt: new Date(
      now.getTime() + PAYMENT_OTP_EXPIRY_MINUTES * 60 * 1000,
    ),
    otpAttempts: 0,
    otpSentAt: now,
    otpVerifiedAt: null,
  });
  if (result.count !== 1) {
    throw new ApiError(429, "Please wait before requesting another OTP.");
  }

  const updated = await repository.findInvoiceByIdForUser(id, userId);
  return {
    invoice: formatInvoice(updated),
    ...debugOtpFields(otp),
  };
};

const verifyMockPaymentOtp = async (userId, id, otp) => {
  const invoice = await refreshInvoiceExpiry(id, userId);
  ensureOtpInvoice(invoice);
  ensureMockFlowAvailable({
    allowProductionOtpTest: await canUseProductionOtpTest(
      userId,
      invoice.paymentPhone,
    ),
  });
  if (invoice.status !== "PENDING") {
    throw new ApiError(409, `Invoice is ${invoice.status}.`);
  }
  if (!invoice.otpHash || !invoice.otpExpiresAt) {
    throw new ApiError(409, "No active OTP challenge exists for this invoice.");
  }

  const now = new Date();
  if (invoice.otpExpiresAt <= now) {
    throw new ApiError(410, "Payment OTP has expired. Request a new code.");
  }
  if (invoice.otpAttempts >= PAYMENT_OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many OTP attempts. Request a new code.");
  }

  const attempt = await repository.incrementOtpAttempts(
    id,
    PAYMENT_OTP_MAX_ATTEMPTS,
    invoice.otpHash,
  );
  if (attempt.count !== 1) {
    throw new ApiError(429, "Too many OTP attempts. Request a new code.");
  }
  if (!verifyPaymentOtpHash(id, otp, invoice.otpHash)) {
    throw new ApiError(401, "Invalid payment OTP.");
  }

  const webhook = mockProvider.createSuccessfulWebhook(invoice);
  const result = await processMockWebhook(webhook.payload, webhook.signature, {
    allowProductionOtpInvoiceId: invoice.id,
  });
  return { ...result, invoice: formatInvoice(result.invoice) };
};

const submitBankTransferReceipt = async (userId, invoiceId, file) => {
  const invoice = await refreshInvoiceExpiry(invoiceId, userId);
  if (invoice.paymentMethod !== BANK_TRANSFER_METHOD)
    throw new ApiError(409, "This invoice is not a bank transfer.");
  if (invoice.status !== "PENDING_VERIFICATION")
    throw new ApiError(
      409,
      "This bank transfer invoice is no longer awaiting verification.",
    );
  if (!invoice.transferReceiptPath && invoice.expiresAt <= new Date()) {
    await repository.expireUnsubmittedBankTransferInvoice(
      invoiceId,
      userId,
      new Date(),
    );
    throw new ApiError(
      409,
      "This bank transfer invoice expired; create a new invoice.",
    );
  }
  const receiptPath = await paymentReceiptStorage.upload(
    userId,
    invoiceId,
    file,
  );
  let result;
  try {
    result = await repository.updateBankTransferReceipt(
      invoiceId,
      userId,
      receiptPath,
    );
  } catch (error) {
    await paymentReceiptStorage.remove(receiptPath).catch(() => {});
    throw error;
  }
  if (result.count !== 1) {
    await paymentReceiptStorage.remove(receiptPath).catch(() => {});
    throw new ApiError(
      409,
      "This bank transfer invoice is no longer awaiting verification.",
    );
  }
  if (invoice.transferReceiptPath)
    await paymentReceiptStorage
      .remove(invoice.transferReceiptPath)
      .catch(() => {});
  return formatInvoice(
    await repository.findInvoiceByIdForUser(invoiceId, userId),
  );
};

const adminBankTransferInvoice = async (invoice) => ({
  ...formatInvoice(invoice),
  user: invoice.user
    ? {
        id: invoice.user.id,
        fullName: invoice.user.fullName,
        phone: invoice.user.phone,
      }
    : null,
  transferReceiptUrl: invoice.transferReceiptPath
    ? await paymentReceiptStorage.createSignedUrl(invoice.transferReceiptPath)
    : null,
  receiptUrlExpiresInSeconds: invoice.transferReceiptPath ? 300 : null,
});

const listBankTransferInvoices = async ({
  status = "PENDING_VERIFICATION",
  skip = 0,
  take = 20,
}) => {
  const [invoices, total] = await Promise.all([
    repository.listBankTransferInvoices({ status, skip, take }),
    repository.countBankTransferInvoices(status),
  ]);
  return {
    invoices: await Promise.all(invoices.map(adminBankTransferInvoice)),
    pagination: { skip, take, total },
  };
};

const reviewBankTransferInvoice = async (
  adminId,
  invoiceId,
  decision,
  rejectionNotes = null,
) => {
  const approving = decision === "APPROVE";
  const now = new Date();
  const reviewed = await prisma.$transaction(async (tx) => {
    const locked = await repository.lockBankTransferInvoice(invoiceId, tx);
    if (!locked)
      throw new ApiError(404, "Bank transfer invoice was not found.");
    const invoice = await repository.findBankTransferInvoiceById(invoiceId, tx);
    if (!invoice || invoice.paymentMethod !== BANK_TRANSFER_METHOD)
      throw new ApiError(404, "Bank transfer invoice was not found.");
    if (invoice.status !== "PENDING_VERIFICATION")
      throw new ApiError(
        409,
        "Bank transfer invoice has already been reviewed.",
      );
    if (!invoice.transferReceiptPath)
      throw new ApiError(
        409,
        "A transfer receipt must be uploaded before review.",
      );
    const status = approving ? "PAID" : "FAILED";
    const claim = await repository.claimBankTransferInvoice(
      invoiceId,
      "PENDING_VERIFICATION",
      {
        status,
        reviewedAt: now,
        reviewedByAdminId: adminId,
        ...(approving ? { paidAt: now } : { failedAt: now, rejectionNotes }),
      },
      tx,
    );
    if (claim.count !== 1)
      throw new ApiError(
        409,
        "Bank transfer invoice has already been reviewed.",
      );
    if (approving) {
      await repository.createPaymentTransaction(
        {
          invoiceId,
          providerTransactionId: "bank-transfer:" + invoice.referenceCode,
          provider: BANK_TRANSFER_PROVIDER,
          amountPaidNis: invoice.amountNis,
          status: "SUCCESS",
          signatureVerified: false,
          providerTimestamp: now,
        },
        tx,
      );
      await walletService.credit({
        userId: invoice.userId,
        amount: invoice.totalTokens,
        transactionType: "TOKEN_TOP_UP",
        referenceType: "PAYMENT_INVOICE",
        referenceId: invoice.id,
        idempotencyKey: "payment-invoice:" + invoice.id,
        paymentInvoiceId: invoice.id,
        description:
          "Bank transfer token package top-up: " + invoice.tokenPackage.name,
        client: tx,
      });
      await notificationService.templates.paymentSuccess(
        {
          userId: invoice.userId,
          invoiceId: invoice.id,
          totalTokens: invoice.totalTokens,
        },
        tx,
      );
    } else {
      await notificationService.templates.bankTransferRejected(
        {
          userId: invoice.userId,
          invoiceId: invoice.id,
          rejectionNotes,
        },
        tx,
      );
    }
    await repository.createAdminAuditLog(
      {
        adminId,
        targetUserId: invoice.userId,
        action: approving ? "BANK_TRANSFER_APPROVED" : "BANK_TRANSFER_REJECTED",
        entityType: "PaymentInvoice",
        entityId: invoice.id,
        oldValues: { status: "PENDING_VERIFICATION" },
        newValues: {
          status,
          rejectionNotes: approving ? null : rejectionNotes,
        },
        notes: rejectionNotes,
      },
      tx,
    );
    return repository.findBankTransferInvoiceById(invoiceId, tx);
  });
  return adminBankTransferInvoice(reviewed);
};

const approveBankTransferInvoice = (adminId, invoiceId) =>
  reviewBankTransferInvoice(adminId, invoiceId, "APPROVE");
const rejectBankTransferInvoice = (adminId, invoiceId, notes) =>
  reviewBankTransferInvoice(adminId, invoiceId, "REJECT", notes);
module.exports = {
  listPackages,
  createInvoice,
  getInvoice,
  listInvoices,
  processMockWebhook,
  simulateMockPayment,
  resendMockPaymentOtp,
  verifyMockPaymentOtp,
  submitBankTransferReceipt,
  listBankTransferInvoices,
  approveBankTransferInvoice,
  rejectBankTransferInvoice,
  formatInvoice,
};
