const prisma = require("../../config/prisma");

const notificationSelect = {
  id: true,
  userId: true,
  errandId: true,
  assignmentId: true,
  notificationType: true,
  channel: true,
  title: true,
  message: true,
  status: true,
  metadata: true,
  createdAt: true,
  sentAt: true,
  readAt: true,
  failedAt: true,
};

const normalizeUnreadWhere = (where) => {
  if (where.status !== "UNREAD") {
    return where;
  }

  const { status, ...rest } = where;
  return { ...rest, status: { not: "READ" } };
};

const create = (data, client = prisma) =>
  client.notification.create({
    data,
    select: notificationSelect,
  });

const findByIdForUser = (id, userId, client = prisma) =>
  client.notification.findFirst({
    where: { id, userId },
    select: notificationSelect,
  });

const findByIdempotencyKey = (idempotencyKey, client = prisma) =>
  client.notification.findUnique({
    where: { idempotencyKey },
    select: notificationSelect,
  });

const listForUser = ({ userId, status, skip, take }, client = prisma) => {
  const where = normalizeUnreadWhere({
    userId,
    ...(status ? { status } : {}),
  });

  return client.notification.findMany({
    where,
    select: notificationSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
};

const countForUser = ({ userId, status }, client = prisma) => {
  const where = normalizeUnreadWhere({
    userId,
    ...(status ? { status } : {}),
  });

  return client.notification.count({ where });
};

const countUnreadForUser = (userId, client = prisma) =>
  client.notification.count({
    where: { userId, status: { not: "READ" } },
  });

const markReadForUser = (id, userId, readAt, client = prisma) =>
  client.notification.updateMany({
    where: { id, userId, status: { not: "READ" } },
    data: { status: "READ", readAt },
  });

const markAllReadForUser = (userId, readAt, client = prisma) =>
  client.notification.updateMany({
    where: { userId, status: { not: "READ" } },
    data: { status: "READ", readAt },
  });

const findUserPreference = (userId, client = prisma) =>
  client.userNotificationPreference.findUnique({ where: { userId } });

module.exports = {
  countForUser,
  countUnreadForUser,
  create,
  findByIdForUser,
  findByIdempotencyKey,
  findUserPreference,
  listForUser,
  markAllReadForUser,
  markReadForUser,
  notificationSelect,
};
