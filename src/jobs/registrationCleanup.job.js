const prisma = require("../config/prisma");
const env = require("../config/env");

const runRegistrationCleanup = () => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingRegistration.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    const otps = await tx.otpVerification.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return { pendingDeleted: pending.count, otpsDeleted: otps.count };
  });
};

const startRegistrationCleanup = () => {
  const run = () => runRegistrationCleanup().catch((error) => {
    console.error("Registration cleanup failed:", error.message);
  });
  run();
  const timer = setInterval(run, env.registrationCleanupIntervalMs);
  timer.unref();
  return timer;
};

module.exports = { runRegistrationCleanup, startRegistrationCleanup };
