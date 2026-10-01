process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

jest.mock("../src/config/prisma", () => ({ $transaction: jest.fn() }));

const prisma = require("../src/config/prisma");
const { runRegistrationCleanup } = require("../src/jobs/registrationCleanup.job");

test("removes expired pending registrations and OTP records", async () => {
  const tx = {
    pendingRegistration: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    otpVerification: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
  prisma.$transaction.mockImplementation((callback) => callback(tx));

  await expect(runRegistrationCleanup()).resolves.toEqual({
    pendingDeleted: 2,
    otpsDeleted: 3,
  });
  expect(tx.pendingRegistration.deleteMany).toHaveBeenCalledWith({
    where: { expiresAt: { lte: expect.any(Date) } },
  });
  expect(tx.otpVerification.deleteMany).toHaveBeenCalledWith({
    where: { expiresAt: { lte: expect.any(Date) } },
  });
});
