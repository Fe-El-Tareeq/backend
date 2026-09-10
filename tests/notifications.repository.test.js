process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";

jest.mock("../src/config/prisma", () => ({
  notification: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
}));

const prisma = require("../src/config/prisma");
const repository = require("../src/features/notifications/notifications.repository");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const notificationId = "650e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  jest.clearAllMocks();
});

test("listForUser requests newest-first paginated notifications for one user", async () => {
  prisma.notification.findMany.mockResolvedValue([]);

  await repository.listForUser({ userId, skip: 5, take: 10 });

  expect(prisma.notification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 5,
      take: 10,
    }),
  );
});

test("UNREAD filter maps to every status except READ", async () => {
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.notification.count.mockResolvedValue(0);

  await repository.listForUser({ userId, status: "UNREAD", skip: 0, take: 20 });
  await repository.countForUser({ userId, status: "UNREAD" });

  expect(prisma.notification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId, status: { not: "READ" } },
    }),
  );
  expect(prisma.notification.count).toHaveBeenCalledWith({
    where: { userId, status: { not: "READ" } },
  });
});

test("read updates are scoped to the current user and only unread rows", async () => {
  const readAt = new Date("2026-09-07T08:00:00.000Z");
  prisma.notification.updateMany.mockResolvedValue({ count: 1 });

  await repository.markReadForUser(notificationId, userId, readAt);
  await repository.markAllReadForUser(userId, readAt);

  expect(prisma.notification.updateMany).toHaveBeenNthCalledWith(1, {
    where: { id: notificationId, userId, status: { not: "READ" } },
    data: { status: "READ", readAt },
  });
  expect(prisma.notification.updateMany).toHaveBeenNthCalledWith(2, {
    where: { userId, status: { not: "READ" } },
    data: { status: "READ", readAt },
  });
});
