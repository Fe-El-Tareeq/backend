const requiredEnvDefaults = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public",
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public",
  JWT_ACCESS_SECRET: "ci_access_secret_change_me",
  JWT_REFRESH_SECRET: "ci_refresh_secret_change_me",
  NODE_ENV: "test",
};

for (const [key, value] of Object.entries(requiredEnvDefaults)) {
  process.env[key] ||= value;
}

function loadSwaggerParser() {
  const candidates = [
    "@apidevtools/swagger-parser",
    "../node_modules/.pnpm/node_modules/@apidevtools/swagger-parser",
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  throw new Error("@apidevtools/swagger-parser is not available.");
}

async function main() {
  const SwaggerParser = loadSwaggerParser();
  const swaggerSpec = require("../src/config/swagger");

  await SwaggerParser.validate(swaggerSpec);
  console.log("OpenAPI document is valid.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
