const ApiError = require("../../utils/ApiError");
const { NOTIFICATION_TYPES } = require("./notifications.constants");
const repository = require("./notifications.repository");

const VALID_LIST_STATUSES = new Set([
  "UNREAD",
  "PENDING",
  "SENT",
  "FAILED",
  "READ",
]);

const serializeNotification = (notification) => ({
  id: notification.id,
  type: notification.notificationType,
  channel: notification.channel,
  title: notification.title,
  message: notification.message,
  status: notification.status,
  isRead: notification.status === "READ",
  createdAt: notification.createdAt,
  readAt: notification.readAt,
  metadata: {
    ...(notification.errandId ? { errandId: notification.errandId } : {}),
    ...(notification.assignmentId
      ? { assignmentId: notification.assignmentId }
      : {}),
    ...(notification.metadata || {}),
  },
});

const createInAppNotification = async (
  {
    userId,
    type,
    title,
    message,
    errandId,
    assignmentId,
    metadata,
    idempotencyKey,
  },
  client,
) => {
  const data = {
    userId,
    notificationType: type,
    channel: "IN_APP",
    title,
    message,
    status: "PENDING",
    ...(errandId ? { errandId } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };

  try {
    return await repository.create(data, client);
  } catch (error) {
    if (error.code !== "P2002" || !idempotencyKey) {
      throw error;
    }

    return repository.findByIdempotencyKey(idempotencyKey, client);
  }
};

const list = async (userId, { skip = 0, take = 20, status } = {}) => {
  if (status && !VALID_LIST_STATUSES.has(status)) {
    throw new ApiError(400, "Notification status filter is not supported.");
  }

  const [notifications, total] = await Promise.all([
    repository.listForUser({ userId, skip, take, status }),
    repository.countForUser({ userId, status }),
  ]);

  return {
    notifications: notifications.map(serializeNotification),
    pagination: { skip, take, total },
  };
};

const unreadCount = async (userId) => ({
  count: await repository.countUnreadForUser(userId),
});

const markRead = async (userId, notificationId) => {
  const notification = await repository.findByIdForUser(notificationId, userId);
  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  if (notification.status !== "READ") {
    await repository.markReadForUser(notificationId, userId, new Date());
  }

  return {
    notification: serializeNotification(
      await repository.findByIdForUser(notificationId, userId),
    ),
  };
};

const markAllRead = async (userId) => {
  const result = await repository.markAllReadForUser(userId, new Date());
  return { updatedCount: result.count };
};

const assignmentAccepted = (
  { requesterId, errandId, assignmentId, tripId },
  client,
) =>
  createInAppNotification(
    {
      userId: requesterId,
      type: NOTIFICATION_TYPES.ASSIGNMENT_ACCEPTED,
      title: "Errand accepted",
      message: "A traveler accepted your errand.",
      errandId,
      assignmentId,
      metadata: { tripId },
      idempotencyKey: `assignment-accepted:${assignmentId}`,
    },
    client,
  );

const assignmentStatusChanged = (
  { userId, errandId, assignmentId, status, actorUserId },
  client,
) =>
  createInAppNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.ASSIGNMENT_STATUS_CHANGED,
      title: "Assignment updated",
      message: `Assignment status changed to ${status}.`,
      errandId,
      assignmentId,
      metadata: { status, actorUserId },
      idempotencyKey: `assignment-status:${assignmentId}:${status}`,
    },
    client,
  );

const assignmentCancelled = (
  { userId, errandId, assignmentId, actorUserId },
  client,
) =>
  createInAppNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.ASSIGNMENT_CANCELLED,
      title: "Assignment cancelled",
      message: "An assignment was cancelled.",
      errandId,
      assignmentId,
      metadata: { actorUserId },
      idempotencyKey: `assignment-cancelled:${assignmentId}`,
    },
    client,
  );

const newChatMessage = (
  { recipientId, senderId, errandId, assignmentId, chatRoomId, messageId },
  client,
) =>
  createInAppNotification(
    {
      userId: recipientId,
      type: NOTIFICATION_TYPES.NEW_CHAT_MESSAGE,
      title: "New chat message",
      message: "You have a new message about an assignment.",
      errandId,
      assignmentId,
      metadata: { chatRoomId, messageId, senderId },
      idempotencyKey: `chat-message:${messageId}`,
    },
    client,
  );

const paymentSuccess = ({ userId, invoiceId, totalTokens }, client) =>
  createInAppNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
      title: "Wallet top-up completed",
      message: `${totalTokens} tokens were added to your wallet.`,
      metadata: { invoiceId },
      idempotencyKey: `payment-success:${invoiceId}`,
    },
    client,
  );

const paymentFailure = ({ userId, invoiceId, reason }, client) =>
  createInAppNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.PAYMENT_FAILURE,
      title: "Payment failed",
      message: "Your payment could not be completed.",
      metadata: { invoiceId, reason },
      idempotencyKey: `payment-failure:${invoiceId}`,
    },
    client,
  );

module.exports = {
  createInAppNotification,
  list,
  markAllRead,
  markRead,
  serializeNotification,
  templates: {
    assignmentAccepted,
    assignmentCancelled,
    assignmentStatusChanged,
    newChatMessage,
    paymentFailure,
    paymentSuccess,
  },
  unreadCount,
};
