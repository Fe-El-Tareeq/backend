process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

jest.mock("../src/services/email.service", () => ({
  send: jest.fn(),
}));
jest.mock("../src/config/prisma", () => ({
  user: { create: jest.fn() },
  otpVerification: { findFirst: jest.fn(), updateMany: jest.fn() },
}));

const emailService = require("../src/services/email.service");
const prisma = require("../src/config/prisma");
const authRepository = require("../src/features/auth/auth.repository");
const verificationDelivery = require("../src/features/auth/verificationDelivery.service");
const {
  isAccountVerifiedForAccess,
} = require("../src/features/auth/accountVerification");

describe("Email OTP security boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.send.mockResolvedValue({ sent: true, providerMessageId: "email-1" });
  });

  test("uses email verification for email-era users and phone verification only for legacy users", () => {
    expect(
      isAccountVerifiedForAccess({
        email: "user@example.com",
        emailVerifiedAt: null,
        phoneVerifiedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      isAccountVerifiedForAccess({
        email: "user@example.com",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: null,
      }),
    ).toBe(true);
    expect(
      isAccountVerifiedForAccess({ email: null, phoneVerifiedAt: new Date() }),
    ).toBe(true);
  });

  test("registration finalization sets email verification without claiming phone ownership", async () => {
    const pending = {
      fullName: "Test User",
      phone: "+970599000000",
      email: "user@example.com",
      passwordHash: "hash",
      neighborhoodId: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
    };
    prisma.user.create.mockResolvedValue({ id: "user-1" });

    await authRepository.createVerifiedUserFromPending(pending);

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("user@example.com");
    expect(data.emailVerifiedAt).toEqual(expect.any(Date));
    expect(data.phoneVerifiedAt).toBeUndefined();
  });

  test("verification email omits the code from its subject", async () => {
    await verificationDelivery.sendVerificationCode({
      email: "user@example.com",
      code: "123456",
      purpose: "EMAIL_VERIFICATION",
      expiresInMinutes: 2,
    });

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Your Btareeqak verification code",
        text: expect.stringContaining("123456"),
      }),
    );
    expect(emailService.send.mock.calls[0][0].subject).not.toContain("123456");
  });

  test("resend invalidation consumes only OTPs older than the authoritative record", async () => {
    const authoritativeOtp = {
      id: "650e8400-e29b-41d4-a716-446655440010",
      createdAt: new Date("2026-09-30T12:00:00.000Z"),
    };
    prisma.otpVerification.updateMany.mockResolvedValue({ count: 1 });

    await authRepository.invalidateSupersededOtps(
      "+970599000000",
      "EMAIL_VERIFICATION",
      authoritativeOtp,
      new Date("2026-09-30T12:00:01.000Z"),
    );

    expect(prisma.otpVerification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: "+970599000000",
          purpose: "EMAIL_VERIFICATION",
          OR: [
            { createdAt: { lt: authoritativeOtp.createdAt } },
            {
              createdAt: authoritativeOtp.createdAt,
              id: { lt: authoritativeOtp.id },
            },
          ],
        }),
      }),
    );
  });

  test("latest OTP lookup excludes failed undelivered records", async () => {
    prisma.otpVerification.findFirst.mockResolvedValue(null);

    await authRepository.findLatestOtpByPhone(
      "+970599000000",
      "EMAIL_VERIFICATION",
    );

    expect(prisma.otpVerification.findFirst).toHaveBeenCalledWith({
      where: {
        phone: "+970599000000",
        purpose: "EMAIL_VERIFICATION",
        deliveredAt: { not: null },
      },
      orderBy: [
        { deliveredAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
  });

  test.each([
    ["code only", undefined, "000000"],
    ["email only", "test@example.com", undefined],
    ["email and code", "test@example.com", "000000"],
  ])("production rejects fixed OTP configuration with %s", (label, email, code) => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEmail = process.env.TEST_OTP_EMAIL;
    const previousCode = process.env.TEST_OTP_CODE;
    process.env.NODE_ENV = "production";
    if (email === undefined) delete process.env.TEST_OTP_EMAIL;
    else process.env.TEST_OTP_EMAIL = email;
    if (code === undefined) delete process.env.TEST_OTP_CODE;
    else process.env.TEST_OTP_CODE = code;

    try {
      expect(() => {
        jest.isolateModules(() => require("../src/config/env"));
      }).toThrow();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousEmail === undefined) delete process.env.TEST_OTP_EMAIL;
      else process.env.TEST_OTP_EMAIL = previousEmail;
      if (previousCode === undefined) delete process.env.TEST_OTP_CODE;
      else process.env.TEST_OTP_CODE = previousCode;
    }
  });
});
