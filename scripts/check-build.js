const requiredEnvDefaults = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public",
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public",
  JWT_ACCESS_SECRET: "ci_access_secret_change_me",
  JWT_REFRESH_SECRET: "ci_refresh_secret_change_me",
  MOCK_PAYMENT_WEBHOOK_SECRET: "ci_mock_payment_secret_change_me",
  NODE_ENV: "test",
};

for (const [key, value] of Object.entries(requiredEnvDefaults)) {
  process.env[key] ||= value;
}

const app = require("../src/app");
const swaggerSpec = require("../src/config/swagger");

if (!app || typeof app.handle !== "function") {
  throw new Error("Express app did not load correctly.");
}

if (!swaggerSpec || swaggerSpec.openapi !== "3.0.3" || !swaggerSpec.paths) {
  throw new Error("Swagger spec did not load correctly.");
}

console.log("Build/import check passed.");
