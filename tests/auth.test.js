process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/auth/auth.repository");
jest.mock("../src/config/prisma", () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

const app = require("../src/app");
const authRepository = require("../src/features/auth/auth.repository");
const authService = require("../src/features/auth/auth.service");
const prisma = require("../src/config/prisma");
const { requireAuth } = require("../src/middleware/auth.middleware");

const mockTx = {};

const activeUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  phone: "+970599000000",
  role: "USER",
  status: "ACTIVE",
  phoneVerifiedAt: new Date(),
  wallet: {
    id: "wallet-1",
  },
};

const runMiddleware = (middleware, req) => {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
};

beforeEach(() => {
  jest.clearAllMocks();

  authRepository.runTransaction.mockImplementation((callback) => {
    return callback(mockTx);
  });
});

describe("Auth request OTP", () => {
  test("valid phone succeeds, stores a hash, and does not return OTP", async () => {
    const response = await request(app)
      .post("/api/v1/auth/request-otp")
      .send({
        phone: "+970599000000",
        channel: "SMS",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.expiresInMinutes).toBe(5);
    expect(JSON.stringify(response.body)).not.toMatch(/\d{6}/);

    const storedOtp = authRepository.createOtpVerification.mock.calls[0][0];

    expect(storedOtp.phone).toBe("+970599000000");
    expect(storedOtp.channel).toBe("SMS");
    expect(storedOtp.otpHash).toMatch(/^\$2/);
    expect(storedOtp.otpHash).not.toMatch(/^\d{6}$/);
  });

  test("invalid phone is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/auth/request-otp")
      .send({
        phone: "123",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createOtpVerification).not.toHaveBeenCalled();
  });
});

describe("Auth verify OTP", () => {
  test("valid OTP creates user wallet, verifies OTP, and issues tokens", async () => {
    const otpHash = await bcrypt.hash("123456", 10);

    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-1",
      phone: "+970599000000",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    authRepository.findUserByPhone.mockResolvedValue(null);
    authRepository.createUser.mockResolvedValue({
      ...activeUser,
      wallet: null,
    });
    authRepository.createWallet.mockResolvedValue(activeUser.wallet);
    authRepository.createRefreshToken.mockResolvedValue({});

    const response = await request(app)
      .post("/api/v1/auth/verify-otp")
      .send({
        phone: "+970599000000",
        otp: "123456",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(authRepository.markOtpAsVerified).toHaveBeenCalledWith(
      "otp-1",
      mockTx,
    );
    expect(authRepository.createUser).toHaveBeenCalledWith(
      "+970599000000",
      mockTx,
    );
    expect(authRepository.createWallet).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );

    const storedRefreshToken =
      authRepository.createRefreshToken.mock.calls[0][0];

    expect(storedRefreshToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedRefreshToken.tokenHash).not.toBe(
      response.body.data.refreshToken,
    );
  });

  test("second verification for existing user does not duplicate wallet", async () => {
    const otpHash = await bcrypt.hash("123456", 10);

    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-2",
      phone: "+970599000000",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    authRepository.findUserByPhone.mockResolvedValue(activeUser);
    authRepository.createRefreshToken.mockResolvedValue({});

    await authService.verifyOtp("+970599000000", "123456");

    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
  });

  test("invalid OTP increments attempts and is rejected", async () => {
    const otpHash = await bcrypt.hash("123456", 10);

    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-3",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    await expect(
      authService.verifyOtp("+970599000000", "999999"),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid OTP.",
    });

    expect(authRepository.incrementOtpAttempts).toHaveBeenCalledWith(
      "otp-3",
      mockTx,
    );
  });

  test("expired OTP is rejected", async () => {
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-4",
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() - 60 * 1000),
      verifiedAt: null,
    });

    await expect(
      authService.verifyOtp("+970599000000", "123456"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "OTP has expired.",
    });
  });

  test("max attempts are enforced", async () => {
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-5",
      attemptCount: 5,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    await expect(
      authService.verifyOtp("+970599000000", "123456"),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: "Too many OTP attempts.",
    });
  });

  test("reused OTP is rejected", async () => {
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-6",
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: new Date(),
    });

    await expect(
      authService.verifyOtp("+970599000000", "123456"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "OTP has already been used.",
    });
  });
});

describe("Auth refresh and logout", () => {
  test("valid refresh token rotates refresh token and issues access token", async () => {
    const refreshToken = jwt.sign(
      {
        type: "refresh",
        userId: activeUser.id,
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      },
    );

    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: "refresh-1",
      tokenHash: authService.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 60 * 1000),
      revokedAt: null,
      user: activeUser,
    });
    authRepository.createRefreshToken.mockResolvedValue({});

    const result = await authService.refresh(refreshToken);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(refreshToken);
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(
      "refresh-1",
      mockTx,
    );
    expect(authRepository.createRefreshToken).toHaveBeenCalled();
  });

  test("invalid refresh token is rejected", async () => {
    await expect(authService.refresh("not-a-token")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid refresh token.",
    });
  });

  test("revoked refresh token is rejected", async () => {
    const refreshToken = jwt.sign(
      {
        type: "refresh",
        userId: activeUser.id,
      },
      process.env.JWT_REFRESH_SECRET,
    );

    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: "refresh-2",
      expiresAt: new Date(Date.now() + 60 * 1000),
      revokedAt: new Date(),
      user: activeUser,
    });

    await expect(authService.refresh(refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      message: "Refresh token has been revoked.",
    });
  });

  test("expired stored refresh token is rejected", async () => {
    const refreshToken = jwt.sign(
      {
        type: "refresh",
        userId: activeUser.id,
      },
      process.env.JWT_REFRESH_SECRET,
    );

    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: "refresh-3",
      expiresAt: new Date(Date.now() - 60 * 1000),
      revokedAt: null,
      user: activeUser,
    });

    await expect(authService.refresh(refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      message: "Refresh token has expired.",
    });
  });

  test("logout revokes refresh token", async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: "refresh-4",
      revokedAt: null,
    });

    await authService.logout("refresh-token");

    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(
      "refresh-4",
    );
  });
});

describe("Auth middleware", () => {
  test("no Bearer token returns 401", async () => {
    const error = await runMiddleware(requireAuth, {
      headers: {},
    });

    expect(error).toMatchObject({
      statusCode: 401,
    });
  });

  test("malformed token returns 401", async () => {
    const error = await runMiddleware(requireAuth, {
      headers: {
        authorization: "Bearer bad-token",
      },
    });

    expect(error).toMatchObject({
      statusCode: 401,
    });
  });

  test("valid access token attaches safe user", async () => {
    const accessToken = jwt.sign(
      {
        type: "access",
        userId: activeUser.id,
        role: activeUser.role,
      },
      process.env.JWT_ACCESS_SECRET,
    );

    prisma.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      phone: activeUser.phone,
      role: activeUser.role,
      status: activeUser.status,
    });

    const req = {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    };

    const error = await runMiddleware(requireAuth, req);

    expect(error).toBeUndefined();
    expect(req.user).toEqual({
      id: activeUser.id,
      phone: activeUser.phone,
      role: activeUser.role,
      status: activeUser.status,
    });
  });

  test.each(["SUSPENDED", "BANNED"])("%s user is rejected", async (status) => {
    const accessToken = jwt.sign(
      {
        type: "access",
        userId: activeUser.id,
        role: activeUser.role,
      },
      process.env.JWT_ACCESS_SECRET,
    );

    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status,
    });

    const error = await runMiddleware(requireAuth, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toMatchObject({
      statusCode: 403,
      message: "User is not active.",
    });
  });
});
