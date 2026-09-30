process.env.NODE_ENV = "test";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));
jest.mock("../src/features/users/users.service");
jest.mock("../src/features/admin/admin.service");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const users = require("../src/features/users/users.service");
const admin = require("../src/features/admin/admin.service");
const userId = process.env.ADMIN_USER_ID;
const id = "650e8400-e29b-41d4-a716-446655440001";
const token = jwt.sign(
  { userId, type: "access" },
  process.env.JWT_ACCESS_SECRET,
);
const uploadPath = "/api/v1/users/me/identity-verification";
const fields = ["idFrontImage", "idBackImage", "selfieImage"];
const jpeg = Buffer.from([255, 216, 255, 0]);
beforeEach(() => {
  jest.resetAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });
  users.submitIdentityVerification.mockResolvedValue({
    id,
    status: "PENDING_REVIEW",
  });
  admin.listVerifications.mockResolvedValue({
    verifications: [],
    pagination: { total: 0 },
    statistics: { total: 0 },
  });
});
test("three files together submit a pending request", async () => {
  let req = request(app)
    .post(uploadPath)
    .set("Authorization", "Bearer " + token);
  for (const field of fields) req = req.attach(field, jpeg, "photo.jpg");
  const response = await req;
  expect(response.statusCode).toBe(201);
  expect(response.body.message).toBe("تم إرسال طلبك للمراجعة");
  expect(users.submitIdentityVerification).toHaveBeenCalledWith(
    userId,
    expect.objectContaining({
      idFrontImage: expect.any(Array),
      idBackImage: expect.any(Array),
      selfieImage: expect.any(Array),
    }),
  );
});
test.each([0, 1, 2])(
  "rejects %s images before calling submission service",
  async (count) => {
    let req = request(app)
      .post(uploadPath)
      .set("Authorization", "Bearer " + token);
    for (const field of fields.slice(0, count))
      req = req.attach(field, jpeg, "photo.jpg");
    expect((await req).statusCode).toBe(400);
    expect(users.submitIdentityVerification).not.toHaveBeenCalled();
  },
);
test.each(["fake", "oversized", "duplicate", "unsupported"])(
  "rejects %s image",
  async (scenario) => {
    let req = request(app)
      .post(uploadPath)
      .set("Authorization", "Bearer " + token);
    for (const field of fields) {
      const content =
        field === fields[0]
          ? scenario === "fake"
            ? Buffer.from("fake")
            : scenario === "oversized"
              ? Buffer.alloc(5 * 1024 * 1024 + 1)
              : jpeg
          : jpeg;
      req = req.attach(
        field,
        content,
        scenario === "unsupported" ? "document.pdf" : "photo.jpg",
      );
    }
    if (scenario === "duplicate")
      req = req.attach(fields[0], jpeg, "second.jpg");
    expect((await req).statusCode).toBe(400);
    expect(users.submitIdentityVerification).not.toHaveBeenCalled();
  },
);
test.each(["ALL", "PENDING_REVIEW", "VERIFIED", "REJECTED"])(
  "dashboard supports %s and search",
  async (status) => {
    const response = await request(app)
      .get("/api/v1/admin/verifications")
      .set("Authorization", "Bearer " + token)
      .query({ status, search: " Farah ", skip: 2, take: 5 });
    expect(response.statusCode).toBe(200);
    expect(admin.listVerifications).toHaveBeenCalledWith({
      status,
      search: "Farah",
      skip: 2,
      take: 5,
    });
  },
);
test("dashboard defaults to ALL", async () => {
  expect(
    (
      await request(app)
        .get("/api/v1/admin/verifications")
        .set("Authorization", "Bearer " + token)
    ).statusCode,
  ).toBe(200);
  expect(admin.listVerifications).toHaveBeenCalledWith({
    status: "ALL",
    skip: 0,
    take: 20,
  });
});
test.each(["", "ab", "x".repeat(501)])(
  "reject requires a valid reason",
  async (reason) => {
    const response = await request(app)
      .post("/api/v1/admin/verifications/" + id + "/reject")
      .set("Authorization", "Bearer " + token)
      .send({ reason });
    expect(response.statusCode).toBe(400);
    expect(admin.rejectVerification).not.toHaveBeenCalled();
  },
);
test.each(["get", "approve", "reject"])(
  "non-admin cannot %s verification",
  async (action) => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: "USER",
      status: "ACTIVE",
    });
    const path = "/api/v1/admin/verifications/" + id;
    const req =
      action === "get"
        ? request(app).get(path)
        : request(app)
            .post(path + "/" + action)
            .send({ reason: "Unclear" });
    expect((await req.set("Authorization", "Bearer " + token)).statusCode).toBe(
      403,
    );
  },
);
test("submission requires authentication", async () => {
  expect((await request(app).post(uploadPath)).statusCode).toBe(401);
});
