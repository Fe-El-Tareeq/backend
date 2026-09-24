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
jest.mock("../src/features/legal/legal.repository");
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
const legalRepository = require("../src/features/legal/legal.repository");
const authService = require("../src/features/auth/auth.service");
const env = require("../src/config/env");
const prisma = require("../src/config/prisma");
const {
  requireAuth,
  requireSuperAdmin,
} = require("../src/middleware/auth.middleware");

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
  key: "ASH_SHUJAIYEH",
  name: "Ash Shujaiyeh",
  governorate: "Gaza display text",
};
const pendingRegistration = {
  id: "650e8400-e29b-41d4-a716-446655440000",
  phone: activeUser.phone,
  fullName: "Leenah Alborsh",
  passwordHash: "$2a$10$hashed",
  neighborhoodId: activeNeighborhood.id,
  termsVersion: "1.0.0",
  privacyVersion: "1.0.0",
  expiresAt: new Date(Date.now() + 60 * 1000),
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
  authRepository.claimOtpVerification.mockResolvedValue({ count: 1 });
  authRepository.findPendingRegistrationByPhone.mockResolvedValue(
    pendingRegistration,
  );
  authRepository.findUserByPhone.mockResolvedValue(null);
  authRepository.createVerifiedUserFromPending.mockResolvedValue({
    ...activeUser,
    wallet: null,
  });
  authRepository.createWallet.mockResolvedValue(activeUser.wallet);
  authRepository.createRefreshToken.mockResolvedValue({});
  env.otpFixedCode = null;
  env.otpTestPhones = [];

  walletRepository.createLedgerEntry.mockResolvedValue({
    id: "signup-bonus-transaction",
    walletId: "wallet-1",
    transactionType: "SIGNUP_BONUS",
    tokenAmount: 10,
    balanceBefore: 0,
    balanceAfter: 10,
  });

  walletRepository.findByIdempotencyKey.mockResolvedValue(null);
  legalRepository.find.mockResolvedValue(null);
  legalRepository.create.mockResolvedValue({
    id: "legal-acceptance-1",
    userId: activeUser.id,
    termsVersion: "1.0.0",
    privacyVersion: "1.0.0",
  });
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

  test("allowlisted test phone uses configured fixed OTP without exposing it", async () => {
    env.otpFixedCode = "000000";
    env.otpTestPhones = ["+970599000000"];

    const response = await request(app).post("/api/v1/auth/request-otp").send({
      phone: "+970599000000",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("000000");

    const storedOtp = authRepository.createOtpVerification.mock.calls[0][0];
    await expect(bcrypt.compare("000000", storedOtp.otpHash)).resolves.toBe(
      true,
    );
    expect(storedOtp.purpose).toBe("PHONE_VERIFICATION");
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
      termsAccepted: true,
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
      termsAccepted: true,
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
      termsAccepted: true,
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
      termsAccepted: true,
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
      termsAccepted: true,
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
        termsAccepted: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Selected neighborhood does not exist or is inactive.",
    });

    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
    expect(authRepository.createOtpVerification).not.toHaveBeenCalled();
  });

  test("register stores only a temporary registration and returns no tokens", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue(null);
    authRepository.createOtpVerification.mockResolvedValue({});

    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "  Leenah Alborsh  ",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
      termsAccepted: true,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.expiresInMinutes).toBe(2);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const [payload] = authRepository.upsertPendingRegistration.mock.calls[0];

    expect(payload).toEqual(
      expect.objectContaining({
        fullName: "Leenah Alborsh",
        phone: "+970599000001",
        neighborhoodId: activeNeighborhood.id,
        termsVersion: "1.0.0",
        privacyVersion: "1.0.0",
      }),
    );
    expect(payload.passwordHash).toMatch(/^\$2/);
    expect(payload.passwordHash).not.toBe("Strong1!");
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
    expect(authRepository.createOtpVerification).toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(walletRepository.createLedgerEntry).not.toHaveBeenCalled();
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  test("duplicate pending registration refreshes temporary data without creating a user", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue(null);
    authRepository.createOtpVerification.mockResolvedValue({});

    const result = await authService.register({
      fullName: "Leenah Alborsh",
      phone: "+970599000000",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
      termsAccepted: true,
    });

    expect(result.message).toBe("Registration OTP sent successfully");
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
    expect(authRepository.upsertPendingRegistration).toHaveBeenCalledWith(
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
        termsAccepted: true,
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
  test("returns the supported cities without authentication", async () => {
    const response = await request(app).get("/api/v1/locations/cities");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "GAZA_CITY",
          nameAr: "مدينة غزة",
          nameEn: "Gaza City",
        }),
        expect.objectContaining({
          key: "RAFAH",
          nameAr: "رفح",
          nameEn: "Rafah",
        }),
      ]),
    );
    expect(response.body.data.cities.map((city) => city.key)).toEqual([
      "NORTH_GAZA",
      "GAZA_CITY",
      "MIDDLE_AREA",
      "DEIR_AL_BALAH",
      "KHAN_YUNIS",
      "RAFAH",
    ]);
    expect(response.body.data.cities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "GAZA_CITY", neighborhoodsCount: 16 }),
        expect.objectContaining({ key: "RAFAH", neighborhoodsCount: 7 }),
      ]),
    );
  });

  test("returns active neighborhoods without authentication", async () => {
    const response = await request(app).get("/api/v1/locations/neighborhoods");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.neighborhoods).toEqual([
      { ...activeNeighborhood, zoneKey: "GAZA_CITY" },
    ]);
    expect(prisma.neighborhood.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          key: {
            not: null,
          },
        },
        select: {
          id: true,
          key: true,
          name: true,
          governorate: true,
        },
      }),
    );
  });

  test("filters active neighborhoods by canonical zone key", async () => {
    const response = await request(app).get(
      "/api/v1/locations/neighborhoods?zoneKey=GAZA_CITY",
    );

    expect(response.statusCode).toBe(200);
    expect(prisma.neighborhood.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          key: { in: expect.arrayContaining(["ASH_SHUJAIYEH"]) },
        },
      }),
    );
    expect(prisma.neighborhood.findMany.mock.calls[0][0].where.key.in).not.toContain(
      "RAFAH_CITY",
    );
  });

  test.each([
    ["NORTH_GAZA", "BEIT_LAHIA", "GAZA_HARBOR"],
    ["MIDDLE_AREA", "AL_ZAHRA", "RAFAH_CITY"],
    ["DEIR_AL_BALAH", "DEIR_AL_BALAH_AL_BALAD", "AN_NUSEIRAT_CAMP"],
    ["KHAN_YUNIS", "KHAN_YUNIS_CITY", "BEIT_LAHIA"],
    ["RAFAH", "RAFAH_CITY", "ASH_SHUJAIYEH"],
  ])("maps catalog zone %s to its own area keys", async (zoneKey, included, excluded) => {
    const response = await request(app).get(
      `/api/v1/locations/neighborhoods?zoneKey=${zoneKey}`,
    );

    expect(response.statusCode).toBe(200);
    const areaKeys = prisma.neighborhood.findMany.mock.calls[0][0].where.key.in;
    expect(areaKeys).toContain(included);
    expect(areaKeys).not.toContain(excluded);
    expect(prisma.neighborhood.findMany.mock.calls[0][0].where.governorate).toBeUndefined();
  });

  test("supports equal aliases and rejects conflicting aliases", async () => {
    const accepted = await request(app).get(
      "/api/v1/locations/neighborhoods?zoneKey=GAZA_CITY&city=GAZA_CITY",
    );
    const rejected = await request(app).get(
      "/api/v1/locations/neighborhoods?zoneKey=GAZA_CITY&city=RAFAH",
    );

    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(400);
  });

  test("rejects an unsupported city", async () => {
    const response = await request(app).get(
      "/api/v1/locations/neighborhoods?city=UNKNOWN_CITY",
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(prisma.neighborhood.findMany).not.toHaveBeenCalled();
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
        zoneKey: null,
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
  test("valid OTP creates the user, creates wallet, removes pending data, and issues tokens", async () => {
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

    const response = await request(app).post("/api/v1/auth/verify-otp").send({
      phone: "+970599000000",
      otp: "123456",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(authRepository.claimOtpVerification).toHaveBeenCalledWith(
      "otp-1",
      expect.any(Date),
      5,
      mockTx,
    );
    expect(authRepository.createVerifiedUserFromPending).toHaveBeenCalledWith(
      pendingRegistration,
      mockTx,
    );
    expect(authRepository.deletePendingRegistration).toHaveBeenCalledWith(
      activeUser.phone,
      mockTx,
    );
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
    expect(legalRepository.create).toHaveBeenCalledWith(
      {
        userId: activeUser.id,
        termsVersion: "1.0.0",
        privacyVersion: "1.0.0",
      },
      mockTx,
    );

    const storedRefreshToken =
      authRepository.createRefreshToken.mock.calls[0][0];

    expect(storedRefreshToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedRefreshToken.tokenHash).not.toBe(
      response.body.data.refreshToken,
    );
  });

  test("valid OTP without a pending registration is rejected", async () => {
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

    authRepository.findPendingRegistrationByPhone.mockResolvedValue(null);

    await expect(
      authService.verifyOtp("+970599000003", "123456"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Pending registration has expired.",
    });

    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  test("OTP verification rejects legacy pending data without legal versions", async () => {
    const otpHash = await bcrypt.hash("123456", 10);
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "otp-without-consent",
      phone: "+970599000004",
      otpHash,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });
    authRepository.findPendingRegistrationByPhone.mockResolvedValue({
      ...pendingRegistration,
      phone: "+970599000004",
      termsVersion: null,
      privacyVersion: null,
    });

    await expect(
      authService.verifyOtp("+970599000004", "123456"),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Legal acceptance is missing. Please restart registration.",
    });
    expect(authRepository.claimOtpVerification).not.toHaveBeenCalled();
    expect(authRepository.createVerifiedUserFromPending).not.toHaveBeenCalled();
    expect(legalRepository.create).not.toHaveBeenCalled();
  });

  test("register requires explicit legal consent", async () => {
    const missing = await request(app).post("/api/v1/auth/register").send({
      fullName: "Leenah Alborsh",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
    });
    const declined = await request(app).post("/api/v1/auth/register").send({
      fullName: "Leenah Alborsh",
      phone: "+970599000001",
      password: "Strong1!",
      neighborhoodId: activeNeighborhood.id,
      termsAccepted: false,
    });

    expect(missing.statusCode).toBe(400);
    expect(declined.statusCode).toBe(400);
    expect(authRepository.upsertPendingRegistration).not.toHaveBeenCalled();
  });

  test("verification cannot create a duplicate existing user", async () => {
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
    await expect(
      authService.verifyOtp("+970599000000", "123456"),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(authRepository.createVerifiedUserFromPending).not.toHaveBeenCalled();
    expect(authRepository.createWallet).not.toHaveBeenCalled();
    expect(walletRepository.createLedgerEntry).not.toHaveBeenCalled();
  });

  test("verify OTP creates a registered user only after confirmation", async () => {
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

    const pending = {
      ...pendingRegistration,
      phone: "+970599000002",
    };
    authRepository.findPendingRegistrationByPhone.mockResolvedValue(pending);
    authRepository.createVerifiedUserFromPending.mockResolvedValue({
      ...activeUser,
      phone: "+970599000002",
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
    expect(authRepository.createVerifiedUserFromPending).toHaveBeenCalledWith(
      pending,
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
      5,
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

describe("Auth forgot and reset password", () => {
  test("forgot password creates a purpose-scoped OTP for an existing user", async () => {
    env.otpFixedCode = "000000";
    env.otpTestPhones = [activeUser.phone];
    authRepository.findUserByPhone.mockResolvedValue(activeUser);

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ phone: activeUser.phone });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.expiresInMinutes).toBe(2);
    expect(response.body.message).toBe(
      "If an account exists, a reset code has been sent.",
    );

    const storedOtp = authRepository.createOtpVerification.mock.calls[0][0];
    expect(storedOtp.purpose).toBe("PASSWORD_RESET");
    await expect(bcrypt.compare("000000", storedOtp.otpHash)).resolves.toBe(
      true,
    );
  });

  test("forgot password does not reveal that a user is missing", async () => {
    authRepository.findUserByPhone.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ phone: "+970599999999" });

    expect(response.statusCode).toBe(200);
    expect(authRepository.createOtpVerification).not.toHaveBeenCalled();
  });

  test("reset password replaces the hash and revokes existing sessions", async () => {
    const otpHash = await bcrypt.hash("000000", 10);
    authRepository.findUserByPhone.mockResolvedValue(activeUser);
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "reset-otp-1",
      phone: activeUser.phone,
      purpose: "PASSWORD_RESET",
      otpHash,
      attemptCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });
    authRepository.updateUserPassword.mockResolvedValue({});
    authRepository.revokeAllRefreshTokensForUser.mockResolvedValue({
      count: 2,
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        phone: activeUser.phone,
        otp: "000000",
        newPassword: "NewStrong1!",
      });

    expect(response.statusCode).toBe(200);
    const storedHash = authRepository.updateUserPassword.mock.calls[0][1];
    await expect(bcrypt.compare("NewStrong1!", storedHash)).resolves.toBe(true);
    expect(authRepository.updateUserPassword).toHaveBeenCalledWith(
      activeUser.id,
      expect.any(String),
      mockTx,
    );
    expect(authRepository.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
  });

  test("invalid reset OTP increments attempts outside the transaction", async () => {
    const otpHash = await bcrypt.hash("000000", 10);
    authRepository.findUserByPhone.mockResolvedValue(activeUser);
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "reset-otp-2",
      otpHash,
      attemptCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 60 * 1000),
      verifiedAt: null,
    });

    await expect(
      authService.resetPassword(activeUser.phone, "999999", "NewStrong1!"),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid password reset code.",
    });

    expect(authRepository.incrementOtpAttempts).toHaveBeenCalledWith(
      "reset-otp-2",
      3,
    );
    expect(authRepository.runTransaction).not.toHaveBeenCalled();
  });
});

describe("Account deletion cancellation", () => {
  const deactivatedUser = {
    ...activeUser,
    status: "DEACTIVATED",
    passwordHash: "$2b$10$hash",
    deletionScheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  test("requests a purpose-scoped OTP during the 30-day recovery window", async () => {
    env.otpFixedCode = "000000";
    env.otpTestPhones = [deactivatedUser.phone];
    authRepository.findUserWithPasswordByPhone.mockResolvedValue(
      deactivatedUser,
    );

    await authService.requestAccountReactivationOtp(deactivatedUser.phone);

    expect(authRepository.createOtpVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: deactivatedUser.phone,
        purpose: "ACCOUNT_REACTIVATION",
      }),
      undefined,
    );
  });

  test("valid OTP and password reactivate the account and clear deletion schedule", async () => {
    const otpHash = await bcrypt.hash("000000", 4);
    const passwordHash = await bcrypt.hash("Strong1!", 4);
    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...deactivatedUser,
      passwordHash,
    });
    authRepository.findLatestOtpByPhone.mockResolvedValue({
      id: "recovery-otp",
      otpHash,
      attemptCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 60000),
      verifiedAt: null,
    });
    authRepository.reactivateUser.mockResolvedValue(activeUser);

    const result = await authService.confirmAccountReactivation(
      deactivatedUser.phone,
      "000000",
      "Strong1!",
    );

    expect(authRepository.reactivateUser).toHaveBeenCalledWith(
      activeUser.id,
      mockTx,
    );
    expect(result.user.status).toBe("ACTIVE");
    expect(result.accessToken).toBeTruthy();
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
  test("super admin middleware requires authentication", async () => {
    const error = await runMiddleware(requireSuperAdmin, {});

    expect(error).toMatchObject({
      statusCode: 401,
      message: "Authentication is required.",
    });
  });

  test("super admin middleware rejects regular users", async () => {
    const error = await runMiddleware(requireSuperAdmin, {
      user: { id: activeUser.id, role: "USER" },
    });

    expect(error).toMatchObject({
      statusCode: 403,
      message: "Super administrator access is required.",
    });
  });

  test("super admin middleware accepts SUPER_ADMIN users", async () => {
    const error = await runMiddleware(requireSuperAdmin, {
      user: { id: activeUser.id, role: "SUPER_ADMIN" },
    });

    expect(error).toBeUndefined();
  });

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
