process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440090";
process.env.NODE_ENV = "test";
const jwt = require("jsonwebtoken");
const request = require("supertest");
jest.mock("../src/features/support/support.repository");
jest.mock("../src/services/email.service", () => ({
  sendSupportTicketNotification: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/support/support.repository");
const email = require("../src/services/email.service");
const userId = "550e8400-e29b-41d4-a716-446655440001";
const adminId = "550e8400-e29b-41d4-a716-446655440090";
const otherAdminId = "550e8400-e29b-41d4-a716-446655440091";
const ticketId = "650e8400-e29b-41d4-a716-446655440001";
const key = "750e8400-e29b-41d4-a716-446655440001";
const messageKey = "750e8400-e29b-41d4-a716-446655440002";
const token = jwt.sign(
  { type: "access", userId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);
const adminToken = jwt.sign(
  { type: "access", userId: adminId, role: "SUPER_ADMIN" },
  process.env.JWT_ACCESS_SECRET,
);
const otherAdminToken = jwt.sign(
  { type: "access", userId: otherAdminId, role: "SUPER_ADMIN" },
  process.env.JWT_ACCESS_SECRET,
);
const ticket = {
  id: ticketId,
  ticketCode: "TKT-ABC123",
  userId,
  status: "OPEN",
  priority: "NORMAL",
  messages: [],
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
  repository.transaction.mockImplementation((cb) => cb({}));
  repository.findByClientKey.mockResolvedValue(null);
  repository.createTicket.mockResolvedValue(ticket);
  repository.createMessage.mockResolvedValue({
    id: key,
    ticketId,
    senderId: userId,
    content: "Help",
  });
  repository.findTicket.mockResolvedValue(ticket);
  repository.listActiveFaqs.mockResolvedValue([]);
  repository.listForUser.mockResolvedValue([ticket]);
  repository.countForUser.mockResolvedValue(1);
  repository.listForAdmin.mockResolvedValue([ticket]);
  repository.countForAdmin.mockResolvedValue(1);
});
test("support endpoints require authentication", async () => {
  await request(app).get("/api/v1/support/tickets").expect(401);
});
test("creates a support ticket and first message", async () => {
  const response = await request(app)
    .post("/api/v1/support/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientRequestKey: key,
      clientMessageKey: messageKey,
      category: "GENERAL_INQUIRY",
      message: "I need help",
    })
    .expect(201);
  expect(response.body.data.created).toBe(true);
  expect(repository.createMessage).toHaveBeenCalled();
  expect(repository.createMessage).toHaveBeenCalledWith(
    expect.objectContaining({ clientMessageKey: messageKey }),
    expect.anything(),
  );
  expect(email.sendSupportTicketNotification).toHaveBeenCalledWith(
    ticket,
    expect.objectContaining({ id: userId }),
    "I need help",
  );
});
test("returns active FAQs and support contact configuration", async () => {
  repository.listActiveFaqs.mockResolvedValue([
    { id: key, question: "How?", answer: "This way." },
  ]);
  const response = await request(app)
    .get("/api/v1/support/config")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  expect(response.body.data.faqs).toHaveLength(1);
  expect(response.body.data.phones).toEqual(expect.any(Array));
});
test("replays the same ticket request but rejects changed data", async () => {
  repository.findByClientKey.mockResolvedValue({
    ...ticket,
    category: "GENERAL_INQUIRY",
    messages: [
      { clientMessageKey: messageKey, content: "I need help" },
    ],
  });
  const body = {
    clientRequestKey: key,
    clientMessageKey: messageKey,
    category: "GENERAL_INQUIRY",
    message: "I need help",
  };
  await request(app)
    .post("/api/v1/support/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send(body)
    .expect(200);
  expect(repository.createTicket).not.toHaveBeenCalled();
  await request(app)
    .post("/api/v1/support/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...body, message: "Different message" })
    .expect(409);
});
test("lists only the authenticated user's tickets", async () => {
  await request(app)
    .get("/api/v1/support/tickets")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  expect(repository.listForUser).toHaveBeenCalledWith(
    expect.objectContaining({ userId }),
  );
});
test("rejects invalid category", async () => {
  await request(app)
    .post("/api/v1/support/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientRequestKey: key, category: "INVALID", message: "Help" })
    .expect(400);
});
test("hides another user's ticket", async () => {
  repository.findTicket.mockResolvedValue({
    ...ticket,
    userId: "550e8400-e29b-41d4-a716-446655440002",
  });
  await request(app)
    .get(`/api/v1/support/tickets/${ticketId}`)
    .set("Authorization", `Bearer ${token}`)
    .expect(404);
});

test("support administration requires the configured dashboard admin", async () => {
  await request(app)
    .get("/api/v1/support/admin/tickets")
    .set("Authorization", `Bearer ${token}`)
    .expect(403);
  await request(app)
    .get("/api/v1/support/admin/tickets")
    .set("Authorization", `Bearer ${otherAdminToken}`)
    .expect(403);
  await request(app)
    .get("/api/v1/support/admin/tickets")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
});

test("only the configured dashboard admin receives cross-user ticket access", async () => {
  repository.findTicket.mockResolvedValue({
    ...ticket,
    userId,
  });

  await request(app)
    .get(`/api/v1/support/tickets/${ticketId}`)
    .set("Authorization", `Bearer ${otherAdminToken}`)
    .expect(404);
  await request(app)
    .get(`/api/v1/support/tickets/${ticketId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
});
