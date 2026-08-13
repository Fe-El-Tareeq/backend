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

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
};
