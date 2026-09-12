process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";
const jwt = require("jsonwebtoken");
const request = require("supertest");
jest.mock("../src/features/reports/reports.repository");
jest.mock("../src/services/email.service", () => ({
  sendReportNotification: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repo = require("../src/features/reports/reports.repository");
const email = require("../src/services/email.service");
const userId = "550e8400-e29b-41d4-a716-446655440001",
  id = "650e8400-e29b-41d4-a716-446655440001",
  key = "750e8400-e29b-41d4-a716-446655440001";
const token = jwt.sign(
  { type: "access", userId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);
const report = {
  id,
  reportCode: "RPT-ABC123",
  reporterId: userId,
  type: "FRAUD_OR_SCAM",
  priority: "HIGH",
  status: "SUBMITTED",
};
beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    role: "USER",
    status: "ACTIVE",
  });
  repo.findByClientKey.mockResolvedValue(null);
  repo.create.mockResolvedValue(report);
  repo.listMine.mockResolvedValue([report]);
  repo.countMine.mockResolvedValue(1);
  repo.findById.mockResolvedValue(report);
});
test("requires authentication", async () => {
  await request(app).get("/api/v1/support/reports").expect(401);
});
test("submits report and calculates high priority", async () => {
  const r = await request(app)
    .post("/api/v1/support/reports")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientRequestKey: key,
      type: "FRAUD_OR_SCAM",
      description: "A user requested payment outside the application.",
    })
    .expect(201);
  expect(r.body.data.report.priority).toBe("HIGH");
  expect(repo.create).toHaveBeenCalledWith(
    expect.objectContaining({ priority: "HIGH", reporterId: userId }),
  );
  expect(email.sendReportNotification).toHaveBeenCalledWith(
    report,
    expect.objectContaining({ id: userId }),
  );
});
test("keeps the report successful when email delivery fails", async () => {
  email.sendReportNotification.mockRejectedValueOnce(
    new Error("Email unavailable"),
  );
  await request(app)
    .post("/api/v1/support/reports")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientRequestKey: key,
      type: "TECHNICAL_ISSUE",
      description: "The application stopped while submitting a request.",
    })
    .expect(201);
  expect(repo.create).toHaveBeenCalled();
});
test("rejects self-reporting", async () => {
  await request(app)
    .post("/api/v1/support/reports")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientRequestKey: key,
      type: "FAKE_ACCOUNT",
      description: "This account is not legitimate.",
      reportedUserId: userId,
    })
    .expect(400);
});
test("does not expose another user's report", async () => {
  repo.findById.mockResolvedValue({
    ...report,
    reporterId: "550e8400-e29b-41d4-a716-446655440002",
  });
  await request(app)
    .get(`/api/v1/support/reports/${id}`)
    .set("Authorization", `Bearer ${token}`)
    .expect(404);
});
