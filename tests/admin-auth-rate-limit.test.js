process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440020";
process.env.NODE_ENV = "test";

const bcrypt = require("bcryptjs");
const request = require("supertest");

jest.mock("../src/features/auth/auth.repository");
jest.mock("../src/config/prisma", () => ({
  user: { findUnique: jest.fn() },
  neighborhood: { findMany: jest.fn() },
}));

const app = require("../src/app");
const authRepository = require("../src/features/auth/auth.repository");

const password = "Strong1!";
const admin = {
  id: process.env.ADMIN_USER_ID,
  phone: "+970599000020",
  passwordHash: bcrypt.hashSync(password, 4),
  phoneVerifiedAt: new Date(),
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};

beforeEach(() => {
  jest.clearAllMocks();
  authRepository.findUserWithPasswordByPhone.mockImplementation((phone) =>
    Promise.resolve(phone === admin.phone ? admin : null),
  );
  authRepository.createRefreshToken.mockResolvedValue({});
});

test("successful logins do not consume the IP budget and phone rotation cannot bypass it", async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ phone: admin.phone, password })
      .expect(200);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app)
      .post("/api/v1/admin/auth/login")
      .send({
        phone: `+9705980000${attempt}`,
        password: "Wrong1!",
      })
      .expect(401);
  }

  const response = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ phone: "+970598000099", password: "Wrong1!" })
    .expect(429);

  expect(response.body).toEqual({
    success: false,
    message: "Too many requests. Please try again later.",
    errors: [],
  });
});
