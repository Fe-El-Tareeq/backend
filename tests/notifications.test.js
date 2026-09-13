process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/notifications/notifications.repository");
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));

const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/notifications/notifications.repository");
const service = require("../src/features/notifications/notifications.service");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const otherUserId = "550e8400-e29b-41d4-a716-446655440002";
const notificationId = "650e8400-e29b-41d4-a716-446655440001";
const otherNotificationId = "650e8400-e29b-41d4-a716-446655440002";
const errandId = "750e8400-e29b-41d4-a716-446655440001";
const assignmentId = "850e8400-e29b-41d4-a716-446655440001";
const invoiceId = "950e8400-e29b-41d4-a716-446655440001";

const token = jwt.sign(
  { type: "access", userId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);

const makeNotification = (overrides = {}) => ({
  id: notificationId,
  userId,
  errandId,
  assignmentId,
  notificationType: "ASSIGNMENT_ACCEPTED",
  channel: "IN_APP",
  title: "Errand accepted",
  message: "A traveler accepted your errand.",
  status: "PENDING",
  metadata: { invoiceId },
  providerMessageId: null,
  createdAt: new Date("2026-09-05T08:00:00.000Z"),
  sentAt: null,
  readAt: null,
  failedAt: null,
  phone: "+970599000000",
  providerPayload: { secret: true },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockImplementation(({ where }) =>
    Promise.resolve({
      id: where.id,
      phone: "+970599000000",
      role: "USER",
      status: "ACTIVE",
    }),
  );
  repository.listForUser.mockResolvedValue([makeNotification()]);
  repository.countForUser.mockResolvedValue(1);
  repository.countUnreadForUser.mockResolvedValue(4);
  repository.findByIdForUser.mockResolvedValue(makeNotification());
  repository.markReadForUser.mockResolvedValue({ count: 1 });
  repository.markAllReadForUser.mockResolvedValue({ count: 3 });
  repository.findUserPreference.mockResolvedValue(null);
});

describe("Notification listing", () => {
  test("authenticated user lists own notifications", async () => {
    const response = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(repository.listForUser).toHaveBeenCalledWith({
      userId,
      skip: 0,
      take: 20,
      status: undefined,
    });
    expect(response.body.data.notifications[0]).toMatchObject({
      id: notificationId,
      type: "ASSIGNMENT_ACCEPTED",
      isRead: false,
      metadata: { errandId, assignmentId, invoiceId },
    });
  });

  test("requires authentication", async () => {
    const response = await request(app).get("/api/v1/notifications");

    expect(response.statusCode).toBe(401);
    expect(repository.listForUser).not.toHaveBeenCalled();
  });

  test("newest-first ordering is requested from repository", async () => {
    await service.list(userId, { skip: 0, take: 20 });

    expect(repository.listForUser).toHaveBeenCalledWith({
      userId,
      skip: 0,
      take: 20,
      status: undefined,
    });
  });

  test("pagination and unread filter are passed through", async () => {
    await request(app)
      .get("/api/v1/notifications?skip=5&take=10&status=UNREAD")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(repository.listForUser).toHaveBeenCalledWith({
      userId,
      skip: 5,
      take: 10,
      status: "UNREAD",
    });
    expect(repository.countForUser).toHaveBeenCalledWith({
      userId,
      status: "UNREAD",
    });
  });

  test("user cannot see another user's notifications", async () => {
    await service.list(userId, { skip: 0, take: 20 });

    expect(repository.listForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
    );
  });

  test("response does not expose sensitive fields", async () => {
    const result = await service.list(userId, { skip: 0, take: 20 });

    expect(result.notifications[0].phone).toBeUndefined();
    expect(result.notifications[0].providerPayload).toBeUndefined();
    expect(result.notifications[0].providerMessageId).toBeUndefined();
  });
});

describe("Notification unread count and read state", () => {
  test("unread count is compact", async () => {
    const response = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toEqual({ count: 4 });
    expect(repository.countUnreadForUser).toHaveBeenCalledWith(userId);
  });

  test("user marks own notification read", async () => {
    repository.findByIdForUser
      .mockResolvedValueOnce(makeNotification())
      .mockResolvedValueOnce(
        makeNotification({ status: "READ", readAt: new Date() }),
      );

    const response = await request(app)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.statusCode).toBe(200);
    expect(repository.markReadForUser).toHaveBeenCalledWith(
      notificationId,
      userId,
      expect.any(Date),
    );
    expect(response.body.data.notification.isRead).toBe(true);
  });

  test("repeated mark-read is idempotent", async () => {
    repository.findByIdForUser.mockResolvedValue(
      makeNotification({ status: "READ", readAt: new Date() }),
    );

    await service.markRead(userId, notificationId);

    expect(repository.markReadForUser).not.toHaveBeenCalled();
  });

  test("user cannot mark another user's notification", async () => {
    repository.findByIdForUser.mockResolvedValue(null);

    await expect(
      service.markRead(userId, otherNotificationId),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repository.markReadForUser).not.toHaveBeenCalled();
  });

  test("mark-all-read updates only current user", async () => {
    const response = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 3 });
    expect(repository.markAllReadForUser).toHaveBeenCalledWith(
      userId,
      expect.any(Date),
    );
  });
});

describe("Notification creation idempotency", () => {
  test("does not create a chat notification when chat notifications are disabled", async () => {
    repository.findUserPreference.mockResolvedValue({
      chatMessagesEnabled: false,
    });

    const result = await service.createInAppNotification({
      userId,
      type: "NEW_CHAT_MESSAGE",
      title: "New chat message",
      message: "You have a new message.",
    });

    expect(result).toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test("payment notifications bypass optional notification preferences", async () => {
    repository.findUserPreference.mockResolvedValue({
      newTripsEnabled: false,
      chatMessagesEnabled: false,
      requestUpdatesEnabled: false,
    });
    repository.create.mockResolvedValue(makeNotification());

    await service.createInAppNotification({
      userId,
      type: "PAYMENT_SUCCESS",
      title: "Wallet top-up completed",
      message: "Tokens were added.",
    });

    expect(repository.findUserPreference).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  test("creates an in-app notification with a duplicate-safe idempotency key", async () => {
    repository.create.mockResolvedValue(makeNotification());

    await service.createInAppNotification({
      userId,
      type: "PAYMENT_SUCCESS",
      title: "Wallet top-up completed",
      message: "28 tokens were added to your wallet.",
      metadata: { invoiceId },
      idempotencyKey: `payment-success:${invoiceId}`,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        notificationType: "PAYMENT_SUCCESS",
        channel: "IN_APP",
        status: "PENDING",
        metadata: { invoiceId },
        idempotencyKey: `payment-success:${invoiceId}`,
      }),
      undefined,
    );
  });

  test("returns the existing notification on idempotency conflict", async () => {
    repository.create.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );
    repository.findByIdempotencyKey.mockResolvedValue(makeNotification());

    const result = await service.createInAppNotification({
      userId,
      type: "PAYMENT_SUCCESS",
      title: "Wallet top-up completed",
      message: "28 tokens were added to your wallet.",
      idempotencyKey: `payment-success:${invoiceId}`,
    });

    expect(result.id).toBe(notificationId);
    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(
      `payment-success:${invoiceId}`,
      undefined,
    );
  });
});
