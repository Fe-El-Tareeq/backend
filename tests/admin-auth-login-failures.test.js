process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440030";
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
const env = require("../src/config/env");

const password = "Strong1!";
const admin = {
  id: process.env.ADMIN_USER_ID,
  phone: "+970599000030",
  passwordHash: bcrypt.hashSync(password, 4),
  phoneVerifiedAt: new Date(),
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};

beforeEach(() => {
  jest.clearAllMocks();
  env.adminUserId = admin.id;
  authRepository.findUserWithPasswordByPhone.mockResolvedValue(admin);
});

test.each([
  ["inactive", { status: "SUSPENDED" }],
  ["unverified", { phoneVerifiedAt: null }],
  [
    "email-era unverified",
    { email: "admin@example.com", emailVerifiedAt: null },
  ],
])("rejects the configured admin when %s without disclosing state", async (label, changes) => {
  authRepository.findUserWithPasswordByPhone.mockResolvedValue({
    ...admin,
    ...changes,
  });

  const response = await request(app).post("/api/v1/admin/auth/login").send({
    phone: admin.phone,
    password,
  });

  expect(response.statusCode).toBe(401);
  expect(response.body).toEqual({
    success: false,
    message: "Invalid phone or password.",
    errors: [],
  });
});

test("rejects login with the same generic response when ADMIN_USER_ID is unset", async () => {
  env.adminUserId = null;

  const response = await request(app).post("/api/v1/admin/auth/login").send({
    phone: admin.phone,
    password,
  });

  expect(response.statusCode).toBe(401);
  expect(response.body).toEqual({
    success: false,
    message: "Invalid phone or password.",
    errors: [],
  });
});
