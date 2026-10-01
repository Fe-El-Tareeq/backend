process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440010";
process.env.NODE_ENV = "test";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/auth/auth.repository");
jest.mock("../src/features/admin/admin.repository");
jest.mock("../src/config/prisma", () => ({
  user: { findUnique: jest.fn() },
  neighborhood: { findMany: jest.fn() },
}));

const app = require("../src/app");
const authRepository = require("../src/features/auth/auth.repository");
const adminRepository = require("../src/features/admin/admin.repository");
const env = require("../src/config/env");
const prisma = require("../src/config/prisma");

const adminId = process.env.ADMIN_USER_ID;
const userId = "550e8400-e29b-41d4-a716-446655440011";
const otherAdminId = "550e8400-e29b-41d4-a716-446655440012";
const password = "Strong1!";
const passwordHash = bcrypt.hashSync(password, 4);

const admin = {
  id: adminId,
  phone: "+970599000010",
  passwordHash,
  phoneVerifiedAt: new Date(),
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const user = {
  ...admin,
  id: userId,
  phone: "+970599000011",
  role: "USER",
};
const otherAdmin = {
  ...admin,
  id: otherAdminId,
  phone: "+970599000012",
};

const accessTokenFor = (account, options = {}) =>
  jwt.sign(
    { type: "access", userId: account.id, role: account.role },
    process.env.JWT_ACCESS_SECRET,
    options,
  );

const refreshTokenFor = (account, options = {}) =>
  jwt.sign(
    { type: "refresh", userId: account.id, jti: `jti-${account.id}` },
    process.env.JWT_REFRESH_SECRET,
    options,
  );

beforeEach(() => {
  jest.clearAllMocks();
  env.adminUserId = adminId;
  authRepository.runTransaction.mockImplementation((callback) => callback({}));
  authRepository.createRefreshToken.mockResolvedValue({});
  authRepository.findUserWithPasswordByPhone.mockImplementation((phone) => {
    return Promise.resolve(
      [admin, user, otherAdmin].find((account) => account.phone === phone) ||
        null,
    );
  });
  prisma.user.findUnique.mockImplementation(({ where }) => {
    const account = [admin, user, otherAdmin].find(
      (candidate) => candidate.id === where.id,
    );
    return Promise.resolve(
      account && {
        id: account.id,
        phone: account.phone,
        role: account.role,
        status: account.status,
      },
    );
  });
  adminRepository.listFaqs.mockResolvedValue([]);
  adminRepository.countFaqs.mockResolvedValue(0);
  adminRepository.listVerifications.mockResolvedValue([]);
  adminRepository.countVerifications.mockResolvedValue(0);
  adminRepository.verificationStatistics.mockResolvedValue([]);
});
describe("Admin dashboard login", () => {
  test("configured verified active admin receives tokens and safe identity data", async () => {
    const response = await request(app).post("/api/v1/admin/auth/login").send({
      phone: admin.phone,
      password,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.user).toEqual({
      id: admin.id,
      phone: admin.phone,
      role: "SUPER_ADMIN",
    });
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|tokenHash|otpHash/,
    );
  });

  test("configured email-era admin uses email verification eligibility", async () => {
    authRepository.findUserWithPasswordByPhone.mockResolvedValue({
      ...admin,
      email: "admin@example.com",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: null,
    });

    await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ phone: admin.phone, password })
      .expect(200);
  });

  test.each([
    ["wrong password", admin.phone, "Wrong1!"],
    ["unknown phone", "+970599000099", password],
    ["normal user", user.phone, password],
    ["non-allowlisted SUPER_ADMIN", otherAdmin.phone, password],
  ])(
    "rejects %s with the generic credentials response",
    async (label, phone, suppliedPassword) => {
      const response = await request(app)
        .post("/api/v1/admin/auth/login")
        .send({
          phone,
          password: suppliedPassword,
        });

      expect(response.statusCode).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: "Invalid phone or password.",
        errors: [],
      });
    },
  );
});

describe("Admin dashboard authorization", () => {
  test("returns 401 for missing, invalid, and expired access tokens", async () => {
    await request(app).get("/api/v1/admin/auth/me").expect(401);
    await request(app)
      .get("/api/v1/admin/auth/me")
      .set("Authorization", "Bearer invalid")
      .expect(401);
    await request(app)
      .get("/api/v1/admin/auth/me")
      .set(
        "Authorization",
        `Bearer ${accessTokenFor(admin, { expiresIn: -1 })}`,
      )
      .expect(401);
  });

  test("returns 403 for a USER and a non-allowlisted SUPER_ADMIN", async () => {
    await request(app)
      .get("/api/v1/admin/auth/me")
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .expect(403);
    await request(app)
      .get("/api/v1/admin/auth/me")
      .set("Authorization", `Bearer ${accessTokenFor(otherAdmin)}`)
      .expect(403);
  });

  test("fails closed when ADMIN_USER_ID is not configured", async () => {
    env.adminUserId = null;

    await request(app)
      .get("/api/v1/admin/auth/me")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
      .expect(403);
  });

  test("returns safe identity data for the configured admin", async () => {
    const response = await request(app)
      .get("/api/v1/admin/auth/me")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
      .expect(200);

    expect(response.body.data.user).toEqual({
      id: admin.id,
      phone: admin.phone,
      role: "SUPER_ADMIN",
    });
  });

  test("enforces exact-one policy on a real admin endpoint", async () => {
    await request(app)
      .get("/api/v1/admin/faqs")
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .expect(403);
    await request(app)
      .get("/api/v1/admin/faqs")
      .set("Authorization", `Bearer ${accessTokenFor(otherAdmin)}`)
      .expect(403);
    await request(app)
      .get("/api/v1/admin/faqs")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
      .expect(200);
  });

  test("rejects a SUPER_ADMIN token claim when the database user is USER", async () => {
    const forgedRoleToken = jwt.sign(
      { type: "access", userId: user.id, role: "SUPER_ADMIN" },
      process.env.JWT_ACCESS_SECRET,
    );

    await request(app)
      .get("/api/v1/admin/faqs")
      .set("Authorization", `Bearer ${forgedRoleToken}`)
      .expect(403);
  });

  test("protects identity-verification administration with the same policy", async () => {
    await request(app)
      .get("/api/v1/admin/verifications")
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .expect(403);
    await request(app)
      .get("/api/v1/admin/verifications")
      .set("Authorization", `Bearer ${accessTokenFor(otherAdmin)}`)
      .expect(403);
    await request(app)
      .get("/api/v1/admin/verifications")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
      .expect(200);
  });
});

describe("Admin dashboard refresh and logout", () => {
  const storedRefreshToken = (account, token, changes = {}) => ({
    id: `stored-${account.id}`,
    userId: account.id,
    tokenHash: require("../src/features/auth/auth.service").hashRefreshToken(
      token,
    ),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: account,
    ...changes,
  });

  test("rotates a valid configured-admin refresh token", async () => {
    const token = refreshTokenFor(admin);
    authRepository.findRefreshTokenByHash.mockResolvedValue(
      storedRefreshToken(admin, token),
    );

    const response = await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: token })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).not.toBe(token);
    expect(authRepository.revokeRefreshToken).toHaveBeenCalled();
    expect(authRepository.createRefreshToken).toHaveBeenCalled();
  });

  test("rejects invalid, revoked, and expired refresh tokens", async () => {
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: "invalid" })
      .expect(401);

    const revokedToken = refreshTokenFor(admin);
    authRepository.findRefreshTokenByHash.mockResolvedValueOnce(
      storedRefreshToken(admin, revokedToken, { revokedAt: new Date() }),
    );
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: revokedToken })
      .expect(401);

    const expiredToken = refreshTokenFor(admin, { expiresIn: -1 });
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: expiredToken })
      .expect(401);
  });

  test("rechecks demotion and ADMIN_USER_ID mismatch before rotation", async () => {
    const token = refreshTokenFor(admin);
    authRepository.findRefreshTokenByHash.mockResolvedValue(
      storedRefreshToken({ ...admin, role: "USER" }, token),
    );
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: token })
      .expect(403);
    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();

    authRepository.findRefreshTokenByHash.mockResolvedValue(
      storedRefreshToken(admin, token),
    );
    env.adminUserId = otherAdminId;
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: token })
      .expect(403);
    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });

  test("logout revokes the supplied token and it cannot refresh", async () => {
    const token = refreshTokenFor(admin);
    const stored = storedRefreshToken(admin, token);
    authRepository.findRefreshTokenByHash.mockResolvedValueOnce(stored);

    await request(app)
      .post("/api/v1/admin/auth/logout")
      .send({ refreshToken: token })
      .expect(200);
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(stored.id);

    authRepository.findRefreshTokenByHash.mockResolvedValueOnce({
      ...stored,
      revokedAt: new Date(),
    });
    await request(app)
      .post("/api/v1/admin/auth/refresh")
      .send({ refreshToken: token })
      .expect(401);
  });

  test("logout is idempotent for invalid, normal-user, and wrong-admin tokens", async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValueOnce(null);
    await request(app)
      .post("/api/v1/admin/auth/logout")
      .send({ refreshToken: "invalid-token" })
      .expect(200);

    const userToken = refreshTokenFor(user);
    const userStored = storedRefreshToken(user, userToken);
    authRepository.findRefreshTokenByHash.mockResolvedValueOnce(userStored);
    await request(app)
      .post("/api/v1/admin/auth/logout")
      .send({ refreshToken: userToken })
      .expect(200);

    const otherAdminToken = refreshTokenFor(otherAdmin);
    const otherAdminStored = storedRefreshToken(otherAdmin, otherAdminToken);
    authRepository.findRefreshTokenByHash.mockResolvedValueOnce(
      otherAdminStored,
    );
    await request(app)
      .post("/api/v1/admin/auth/logout")
      .send({ refreshToken: otherAdminToken })
      .expect(200);

    expect(authRepository.revokeRefreshToken).toHaveBeenNthCalledWith(
      1,
      userStored.id,
    );
    expect(authRepository.revokeRefreshToken).toHaveBeenNthCalledWith(
      2,
      otherAdminStored.id,
    );
  });
});
