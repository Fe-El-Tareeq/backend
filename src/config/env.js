require("dotenv").config();

const requiredEnvVars = [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const otpFixedCode = process.env.OTP_FIXED_CODE || null;

if (otpFixedCode && !/^\d{6}$/.test(otpFixedCode)) {
  throw new Error("OTP_FIXED_CODE must contain exactly 6 digits");
}

const otpTestPhones = (process.env.OTP_TEST_PHONES || "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);

const mockPaymentEnabled = process.env.MOCK_PAYMENT_ENABLED === "true";
const mockPaymentOtpTestPhone =
  process.env.MOCK_PAYMENT_OTP_TEST_PHONE || "+970599000000";
const mockPaymentOtpTestCode =
  process.env.MOCK_PAYMENT_OTP_TEST_CODE || "123456";
const mockPaymentProductionOtpTestEnabled =
  process.env.MOCK_PAYMENT_PRODUCTION_OTP_TEST_ENABLED === "true";

if (!/^\d{6}$/.test(mockPaymentOtpTestCode)) {
  throw new Error("MOCK_PAYMENT_OTP_TEST_CODE must contain exactly 6 digits");
}
const accountDeletionRetentionDays = Number(
  process.env.ACCOUNT_DELETION_RETENTION_DAYS || 30,
);
const accountDeletionCleanupIntervalMs = Number(
  process.env.ACCOUNT_DELETION_CLEANUP_INTERVAL_MS || 3600000,
);
const registrationCleanupIntervalMs = Number(
  process.env.REGISTRATION_CLEANUP_INTERVAL_MS || 300000,
);
const supportPhones = (process.env.SUPPORT_PHONES || process.env.SUPPORT_PHONE || "059992735")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);

if (!Number.isInteger(accountDeletionRetentionDays) || accountDeletionRetentionDays < 1) {
  throw new Error("ACCOUNT_DELETION_RETENTION_DAYS must be a positive integer");
}

if (!Number.isInteger(accountDeletionCleanupIntervalMs) || accountDeletionCleanupIntervalMs < 60000) {
  throw new Error("ACCOUNT_DELETION_CLEANUP_INTERVAL_MS must be at least 60000");
}
if (!Number.isInteger(registrationCleanupIntervalMs) || registrationCleanupIntervalMs < 60000) {
  throw new Error("REGISTRATION_CLEANUP_INTERVAL_MS must be at least 60000");
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  otpFixedCode,
  otpTestPhones,
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  profileImagesBucket: process.env.PROFILE_IMAGES_BUCKET || "profile-images",
  identityVerificationsBucket:
    process.env.IDENTITY_VERIFICATIONS_BUCKET || "identity-verifications",
  mockPaymentEnabled,
  mockPaymentOtpTestPhone,
  mockPaymentOtpTestCode,
  mockPaymentProductionOtpTestEnabled,
  mockPaymentWebhookSecret: process.env.MOCK_PAYMENT_WEBHOOK_SECRET || null,
  bankTransferBeneficiaryName: process.env.BANK_TRANSFER_BENEFICIARY_NAME || null,
  bankTransferAccountNumber: process.env.BANK_TRANSFER_ACCOUNT_NUMBER || null,
  bankTransferIban: process.env.BANK_TRANSFER_IBAN || null,
  bankTransferBankName: process.env.BANK_TRANSFER_BANK_NAME || null,
  paymentReceiptsBucket: process.env.PAYMENT_RECEIPTS_BUCKET || "payment-receipts",
  supportEmail: process.env.SUPPORT_EMAIL || "support@wasel.ps",
  supportPhones,
  supportWorkingHours: {
    days: process.env.SUPPORT_WORKING_DAYS || "SUNDAY_THURSDAY",
    from: process.env.SUPPORT_WORKING_FROM || "09:00",
    to: process.env.SUPPORT_WORKING_TO || "17:00",
  },
  reportNotificationEmail:
    process.env.REPORT_NOTIFICATION_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    "support@wasel.ps",
  emailFrom: process.env.EMAIL_FROM || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  accountDeletionRetentionDays,
  accountDeletionCleanupIntervalMs,
  registrationCleanupIntervalMs,
};
