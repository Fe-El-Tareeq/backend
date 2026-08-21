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
jest.mock("../src/features/wallet/wallet.repository");
jest.mock("../src/config/prisma", () => ({
  user: {
    findUnique: jest.fn(),
  },
  neighborhood: {
    findMany: jest.fn(),
  },
}));

const app = require("../src/app");
const authRepository = require("../src/features/auth/auth.repository");
const walletRepository = require("../src/features/wallet/wallet.repository");
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

const activeNeighborhood = {
  id: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
  name: "Al-Bireh",
  governorate: "Ramallah and Al-Bireh",
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

  walletRepository.createLedgerEntry.mockResolvedValue({
    id: "signup-bonus-transaction",
    walletId: "wallet-1",
    transactionType: "SIGNUP_BONUS",
    tokenAmount: 3,
    balanceBefore: 0,
    balanceAfter: 3,
  });

  walletRepository.findByIdempotencyKey.mockResolvedValue(null);
  authRepository.findActiveNeighborhoodById.mockResolvedValue(
    activeNeighborhood,
  );
  prisma.neighborhood.findMany.mockResolvedValue([activeNeighborhood]);
});

describe("Auth request OTP", () => {
  test("valid phone succeeds, stores a hash, and does not return OTP", async () => {
    const response = await request(app).post("/api/v1/auth/request-otp").send({
      phone: "+970599000000",
      channel: "SMS",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.expiresInMinutes).toBe(2);
    expect(JSON.stringify(response.body)).not.toMatch(/\d{6}/);

    const storedOtp = authRepository.createOtpVerification.mock.calls[0][0];

    expect(storedOtp.phone).toBe("+970599000000");
    expect(storedOtp.channel).toBe("SMS");
    expect(storedOtp.otpHash).toMatch(/^\$2/);
    expect(storedOtp.otpHash).not.toMatch(/^\d{6}$/);
  });

  test("invalid phone is rejected", async () => {
    const response = await request(app).post("/api/v1/auth/request-otp").send({
      phone: "123",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createOtpVerification).not.toHaveBeenCalled();
  });
});

describe("Auth register and login", () => {
  test("register validates password strength", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Leenah Alborsh",
      phone: "+970599000000",
      password: "weakpass",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  test("register rejects missing fullName", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  test("register rejects whitespace-only fullName", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "   ",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  test("register rejects missing neighborhoodId", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Leenah Alborsh",
      phone: "+970599000001",
      password: "Strong1!",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  test("register rejects an invalid neighborhood UUID", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Leenah Alborsh",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: "not-a-uuid",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(authRepository.findActiveNeighborhoodById).not.toHaveBeenCalled();
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  test("register rejects nonexistent or inactive neighborhood", async () => {
    authRepository.findActiveNeighborhoodById.mockResolvedValue(null);

    await expect(
      authService.register({
        fullName: "Leenah Alborsh",
        phone: "+970599000001",
        password: "Strong1!",
        neighborhoodId: activeNeighborhood.id,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Selected neighborhood does not exist or is inactive.",
    });

    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
    expect(authRepository.createOtpVerification).not.toHaveBeenCalled();
  });

  test("register creates unverified user, stores hashed password, creates OTP, and returns no tokens", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue(null);
    authRepository.createUserWithPassword.mockResolvedValue({
      ...activeUser,
      passwordHash: "$2a$10$hashed",
      wallet: null,
    });
    authRepository.createOtpVerification.mockResolvedValue({});

    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "  Leenah Alborsh  ",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.expiresInMinutes).toBe(2);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const [payload] =
      authRepository.createUserWithPassword.mock.calls[0];

    expect(payload).toEqual(
      expect.objectContaining({
        fullName: "Leenah Alborsh",
        phone: "+970599000001",
        neighborhoodId: activeNeighborhood.id,
      }),
    );
    expect(payload.passwordHash).toMatch(/^\$2/);
    expect(payload.passwordHash).not.toBe("Strong1!");
    expect(authRepository.createOtpVerification).toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(walletRepository.createLedgerEntry).not.toHaveBeenCalled();
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  test("duplicate registration for unverified user does not duplicate user wallet or bonus", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      phoneVerifiedAt: null,
      passwordHash: "$2a$10$oldhash",
    });
    authRepository.updatePreparedUserRegistration.mockResolvedValue({
      ...activeUser,
      phoneVerifiedAt: null,
      passwordHash: "$2a$10$newhash",
    });
    authRepository.createOtpVerification.mockResolvedValue({});

    const result = await authService.register({
      fullName: "Leenah Alborsh",
      phone: "+970599000000",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(result.message).toBe("Registration OTP sent successfully");
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
    expect(authRepository.updatePreparedUserRegistration).toHaveBeenCalledWith(
      activeUser.id,
      expect.objectContaining({
        fullName: "Leenah Alborsh",
        neighborhoodId: activeNeighborhood.id,
        passwordHash: expect.stringMatching(/^\$2/),
      }),
      mockTx,
    );
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(walletRepository.createLedgerEntry).not.toHaveBeenCalled();
  });

  test("register rejects an existing verified password user", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      passwordHash: "$2a$10$hashed",
    });

    await expect(
      authService.register({
        fullName: "Leenah Alborsh",
        phone: "+970599000000",
        password: "Strong1!",
        neighborhoodId: activeNeighborhood.id,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A user with this phone already exists.",
    });
  });

  test("login succeeds with a valid password", async () => {
    const passwordHash = await bcrypt.hash("Strong1!", 10);

    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      passwordHash,
    });
    authRepository.createRefreshToken.mockResolvedValue({});

    const response = await request(app).post("/api/v1/auth/login").send({
      phone: "+970599000000",
      password: "Strong1!",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  test("login before phone verification is rejected", async () => {
    const passwordHash = await bcrypt.hash("Strong1!", 10);

    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      phoneVerifiedAt: null,
      passwordHash,
    });

    await expect(
      authService.login("+970599000000", "Strong1!"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Phone number is not verified.",
    });
  });

  test("login rejects an invalid password", async () => {
    const passwordHash = await bcrypt.hash("Strong1!", 10);

    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      passwordHash,
    });

    await expect(
      authService.login("+970599000000", "Wrong1!"),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid phone or password.",
    });
  });

  test("legacy user without password is handled with generic credentials error", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...activeUser,
      passwordHash: null,
    });

    await expect(
      authService.login("+970599000000", "Strong1!"),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid phone or password.",
    });
  });
});

describe("Locations neighborhoods", () => {
  test("returns active neighborhoods without authentication", async () => {
    const response = await request(app).get("/api/v1/locations/neighborhoods");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.neighborhoods).toEqual([activeNeighborhood]);
    expect(prisma.neighborhood.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      }),
    );
  });

  test("does not expose inactive neighborhoods", async () => {
    prisma.neighborhood.findMany.mockResolvedValue([
      {
        id: activeNeighborhood.id,
        name: activeNeighborhood.name,
        governorate: activeNeighborhood.governorate,
      },
    ]);

    const response = await request(app).get("/api/v1/locations/neighborhoods");

    expect(response.statusCode).toBe(200);
    expect(response.body.data.neighborhoods).toEqual([
      {
        id: activeNeighborhood.id,
        name: activeNeighborhood.name,
        governorate: activeNeighborhood.governorate,
      },
    ]);
    expect(
      response.body.data.neighborhoods.some(
        (neighborhood) => neighborhood.isActive === false,
      ),
    ).toBe(false);
  });
});

describe("Auth verify OTP", () => {
  test("valid OTP activates prepared user, creates wallet, and issues tokens", async () => {
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

    authRepository.findUserByPhone.mockResolvedValue({
      ...activeUser,
      phoneVerifiedAt: null,
      passwordHash: "$2a$10$hashed",
      wallet: null,
    });
    authRepository.updateUserPhoneVerifiedAt.mockResolvedValue({
      ...activeUser,
      passwordHash: "$2a$10$hashed",
      wallet: null,
    });
    authRepository.createWallet.mockResolvedValue(activeUser.wallet);
    authRepository.createRefreshToken.mockResolvedValue({});

    const response = await request(app).post("/api/v1/auth/verify-otp").send({
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
    expect(authRepository.updateUserPhoneVerifiedAt).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.createWallet).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
    expect(walletRepository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: "SIGNUP_BONUS",
        idempotencyKey: `signup-bonus:${activeUser.id}`,
      }),
      mockTx,
    );

    const storedRefreshToken =
      authRepository.createRefreshToken.mock.calls[0][0];

    expect(storedRefreshToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedRefreshToken.tokenHash).not.toBe(
      response.body.data.refreshToken,
    );
  });

  test("valid OTP without a prepared user is rejected", async () => {
    const otpHash = await bcrypt.hash("123456", 10);

    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-no-user",
      phone: "+970599000003",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    authRepository.findUserByPhone.mockResolvedValue(null);

    await expect(
      authService.verifyOtp("+970599000003", "123456"),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "User not found.",
    });

    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
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
    walletRepository.findByIdempotencyKey.mockResolvedValue({
      id: "existing-signup-bonus",
    });
    authRepository.createRefreshToken.mockResolvedValue({});

    await authService.verifyOtp("+970599000000", "123456");

    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(walletRepository.createLedgerEntry).not.toHaveBeenCalled();
  });

  test("verify OTP activates registered unverified user and then issues tokens", async () => {
    const otpHash = await bcrypt.hash("123456", 10);

    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-registration",
      phone: "+970599000002",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    authRepository.findUserByPhone.mockResolvedValue({
      ...activeUser,
      phone: "+970599000002",
      phoneVerifiedAt: null,
      passwordHash: "$2a$10$hashed",
      wallet: null,
    });

    authRepository.updateUserPhoneVerifiedAt.mockResolvedValue({
      ...activeUser,
      phone: "+970599000002",
      passwordHash: "$2a$10$hashed",
      wallet: null,
    });
    authRepository.createWallet.mockResolvedValue(activeUser.wallet);
    authRepository.createRefreshToken.mockResolvedValue({});

    const response = await request(app).post("/api/v1/auth/verify-otp").send({
      phone: "+970599000002",
      otp: "123456",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(authRepository.updateUserPhoneVerifiedAt).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
    expect(authRepository.createWallet).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
    expect(walletRepository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `signup-bonus:${activeUser.id}`,
      }),
      mockTx,
    );
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

    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-4");
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
