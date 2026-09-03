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
  mockPaymentEnabled,
  mockPaymentWebhookSecret: process.env.MOCK_PAYMENT_WEBHOOK_SECRET || null,
};
