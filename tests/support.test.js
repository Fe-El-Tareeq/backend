process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
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
const ticketId = "650e8400-e29b-41d4-a716-446655440001";
const key = "750e8400-e29b-41d4-a716-446655440001";
const token = jwt.sign(
  { type: "access", userId, role: "USER" },
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
  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    role: "USER",
    status: "ACTIVE",
  });
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
  repository.listForUser.mockResolvedValue([ticket]);
  repository.countForUser.mockResolvedValue(1);
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
      category: "GENERAL_INQUIRY",
      message: "I need help",
    })
    .expect(201);
  expect(response.body.data.created).toBe(true);
  expect(repository.createMessage).toHaveBeenCalled();
  expect(email.sendSupportTicketNotification).toHaveBeenCalledWith(
    ticket,
    expect.objectContaining({ id: userId }),
    "I need help",
  );
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
