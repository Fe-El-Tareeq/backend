const prisma = require("../../config/prisma");

const safeUserSelect = {
  id: true,
  fullName: true,
  trustScore: true,
  profileImageUrl: true,
};

const assignmentSelect = {
  id: true,
  errandId: true,
  travelerId: true,
  tripId: true,
  status: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
  errand: {
    select: {
      id: true,
      requesterId: true,
      title: true,
      status: true,
      requester: {
        select: safeUserSelect,
      },
    },
  },
  traveler: {
    select: safeUserSelect,
  },
};

const chatRoomSelect = {
  id: true,
  assignmentId: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  assignment: {
    select: assignmentSelect,
  },
};

const messageSelect = {
  id: true,
  chatRoomId: true,
  senderId: true,
  clientMessageKey: true,
  messageType: true,
  contentText: true,
  audioUrl: true,
  audioDurationSec: true,
  isRead: true,
  sentAt: true,
  readAt: true,
  expiresAt: true,
  sender: {
    select: safeUserSelect,
  },
};

const runTransaction = async (callback) => prisma.$transaction(callback);

const findRoomById = async (roomId, client = prisma) => {
  return client.chatRoom.findUnique({
    where: { id: roomId },
    select: chatRoomSelect,
  });
};

const listRoomsForUser = async (userId, client = prisma) => {
  return client.chatRoom.findMany({
    where: {
      assignment: {
        OR: [
          { travelerId: userId },
          { errand: { requesterId: userId } },
        ],
      },
    },
    select: {
      ...chatRoomSelect,
      messages: {
        select: messageSelect,
        orderBy: [
          { sentAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
      },
      _count: {
        select: {
          messages: {
            where: {
              senderId: { not: userId },
              isRead: false,
            },
          },
        },
      },
    },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
};

const findMessageById = async (messageId, client = prisma) => {
  return client.chatMessage.findUnique({
    where: { id: messageId },
    select: messageSelect,
  });
};

const findMessageBySenderAndClientKey = async (
  senderId,
  clientMessageKey,
  client = prisma,
) => {
  return client.chatMessage.findUnique({
    where: {
      senderId_clientMessageKey: {
        senderId,
        clientMessageKey,
      },
    },
    select: messageSelect,
  });
};

const listMessages = async (
  { roomId, limit, beforeMessage, order = "desc" },
  client = prisma,
) => {
  const where = { chatRoomId: roomId };

  if (beforeMessage) {
    where.OR = [
      { sentAt: { lt: beforeMessage.sentAt } },
      {
        sentAt: beforeMessage.sentAt,
        id: { lt: beforeMessage.id },
      },
    ];
  }

  return client.chatMessage.findMany({
    where,
    select: messageSelect,
    orderBy: [
      { sentAt: order },
      { id: order },
    ],
    take: limit,
  });
};

const listMessagesSince = async (
  { roomId, since, until, limit },
  client = prisma,
) => {
  return client.chatMessage.findMany({
    where: {
      chatRoomId: roomId,
      sentAt: {
        gt: since,
        lte: until,
      },
    },
    select: messageSelect,
    orderBy: [
      { sentAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
  });
};

const createMessage = async (data, client = prisma) => {
  return client.chatMessage.create({
    data,
    select: messageSelect,
  });
};

const updateRoomLastMessageAt = async (roomId, lastMessageAt, client = prisma) => {
  return client.chatRoom.update({
    where: { id: roomId },
    data: { lastMessageAt },
    select: { id: true },
  });
};

const markMessagesRead = async (roomId, readerId, readAt, client = prisma) => {
  return client.chatMessage.updateMany({
    where: {
      chatRoomId: roomId,
      senderId: { not: readerId },
      isRead: false,
    },
    data: {
      isRead: true,
      readAt,
    },
  });
};

module.exports = {
  createMessage,
  findMessageById,
  findMessageBySenderAndClientKey,
  findRoomById,
  listMessages,
  listMessagesSince,
  listRoomsForUser,
  markMessagesRead,
  runTransaction,
  updateRoomLastMessageAt,
};
