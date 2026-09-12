process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/users/users.repository");
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));

const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/users/users.repository");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const token = jwt.sign(
  { type: "access", userId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);

const preference = (overrides = {}) => ({
  userId,
  newTripsEnabled: true,
  chatMessagesEnabled: true,
  requestUpdatesEnabled: true,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    phone: "+970599000000",
    role: "USER",
    status: "ACTIVE",
  });
  repository.findUserById.mockResolvedValue({ id: userId, status: "ACTIVE" });
  repository.findNotificationPreference.mockResolvedValue(null);
  repository.upsertNotificationPreference.mockResolvedValue(preference());
});

test("settings endpoints require authentication", async () => {
  await request(app).get("/api/v1/users/me/settings").expect(401);
  await request(app)
    .patch("/api/v1/users/me/settings/notifications")
    .send({ chatMessagesEnabled: false })
    .expect(401);
});

test("returns enabled defaults when the user has no stored preferences", async () => {
  const response = await request(app)
    .get("/api/v1/users/me/settings")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  expect(response.body.data.notifications).toEqual({
    newTripsEnabled: true,
    chatMessagesEnabled: true,
    requestUpdatesEnabled: true,
  });
});

test("returns the authenticated user's stored preferences", async () => {
  repository.findNotificationPreference.mockResolvedValue(
    preference({ chatMessagesEnabled: false }),
  );

  const response = await request(app)
    .get("/api/v1/users/me/settings")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  expect(response.body.data.notifications.chatMessagesEnabled).toBe(false);
  expect(repository.findNotificationPreference).toHaveBeenCalledWith(userId);
});

test("partially updates notification preferences", async () => {
  repository.upsertNotificationPreference.mockResolvedValue(
    preference({ chatMessagesEnabled: false }),
  );

  const response = await request(app)
    .patch("/api/v1/users/me/settings/notifications")
    .set("Authorization", `Bearer ${token}`)
    .send({ chatMessagesEnabled: false })
    .expect(200);

  expect(repository.upsertNotificationPreference).toHaveBeenCalledWith(userId, {
    chatMessagesEnabled: false,
  });
  expect(response.body.data.notifications.chatMessagesEnabled).toBe(false);
});

test("rejects an empty or unknown settings payload", async () => {
  await request(app)
    .patch("/api/v1/users/me/settings/notifications")
    .set("Authorization", `Bearer ${token}`)
    .send({})
    .expect(400);

  await request(app)
    .patch("/api/v1/users/me/settings/notifications")
    .set("Authorization", `Bearer ${token}`)
    .send({ darkMode: true })
    .expect(400);

  expect(repository.upsertNotificationPreference).not.toHaveBeenCalled();
});
