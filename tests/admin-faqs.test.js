process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");
jest.mock("../src/features/admin/admin.repository");
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/admin/admin.repository");

const adminId = "550e8400-e29b-41d4-a716-446655440001";
const userId = "550e8400-e29b-41d4-a716-446655440002";
const otherAdminId = "550e8400-e29b-41d4-a716-446655440003";
const faqId = "650e8400-e29b-41d4-a716-446655440001";
const tokenFor = (id, role) =>
  jwt.sign({ type: "access", userId: id, role }, process.env.JWT_ACCESS_SECRET);
const adminToken = tokenFor(adminId, "SUPER_ADMIN");
const userToken = tokenFor(userId, "USER");
const otherAdminToken = tokenFor(otherAdminId, "SUPER_ADMIN");
const faq = {
  id: faqId,
  question: "How do I create an errand?",
  answer: "Open the errands page.",
  isActive: true,
  displayOrder: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockImplementation(({ where }) =>
    Promise.resolve({
      id: where.id,
      role: where.id === userId ? "USER" : "SUPER_ADMIN",
      status: "ACTIVE",
    }),
  );
  repository.runTransaction.mockImplementation((callback) => callback({}));
  repository.listFaqs.mockResolvedValue([faq]);
  repository.countFaqs.mockResolvedValue(1);
  repository.findFaqById.mockResolvedValue(faq);
  repository.createFaq.mockResolvedValue(faq);
  repository.updateFaq.mockImplementation((id, data) =>
    Promise.resolve({ ...faq, ...data, id }),
  );
  repository.createAuditLog.mockResolvedValue({ id: "audit-1" });
});

test("FAQ admin endpoints require SUPER_ADMIN", async () => {
  await request(app).get("/api/v1/admin/faqs").expect(401);
  await request(app)
    .get("/api/v1/admin/faqs")
    .set("Authorization", `Bearer ${userToken}`)
    .expect(403);
  await request(app)
    .get("/api/v1/admin/faqs")
    .set("Authorization", `Bearer ${otherAdminToken}`)
    .expect(403);
});

test("SUPER_ADMIN lists and creates FAQs", async () => {
  await request(app)
    .get("/api/v1/admin/faqs?isActive=true")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  const response = await request(app)
    .post("/api/v1/admin/faqs")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ question: faq.question, answer: faq.answer, displayOrder: 1 })
    .expect(201);
  expect(response.body.data.faq.id).toBe(faqId);
  expect(repository.createAuditLog).toHaveBeenCalled();
});

test("SUPER_ADMIN updates, deactivates, and reorders FAQs", async () => {
  await request(app)
    .patch(`/api/v1/admin/faqs/${faqId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ answer: "Updated answer." })
    .expect(200);
  await request(app)
    .delete(`/api/v1/admin/faqs/${faqId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  expect(repository.updateFaq).toHaveBeenCalledWith(
    faqId,
    { isActive: false },
    expect.anything(),
  );
  await request(app)
    .patch("/api/v1/admin/faqs/reorder")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ items: [{ id: faqId, displayOrder: 4 }] })
    .expect(200);
});

test("rejects empty updates and duplicate reorder IDs", async () => {
  await request(app)
    .patch(`/api/v1/admin/faqs/${faqId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({})
    .expect(400);
  await request(app)
    .patch("/api/v1/admin/faqs/reorder")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ items: [{ id: faqId, displayOrder: 1 }, { id: faqId, displayOrder: 2 }] })
    .expect(400);
});
