const ApiError = require("../../utils/ApiError");
const {
  ACTIVE_ASSIGNMENT_STATUSES,
  DEFAULT_MESSAGE_LIMIT,
  MESSAGE_RETENTION_DAYS,
  MESSAGE_TYPES,
} = require("./chat.constants");
const repository = require("./chat.repository");

const addDays = (date, days) => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
};

const serializeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    trustScore: user.trustScore,
    profileImageUrl: user.profileImageUrl,
  };
};

const getRequesterId = (room) => room.assignment?.errand?.requesterId;

const isParticipant = (room, userId) => {
  return (
    room.assignment?.travelerId === userId ||
    getRequesterId(room) === userId
  );
};

const assertParticipant = (room, userId) => {
  if (!room) {
    throw new ApiError(404, "Chat room not found.");
  }

  if (!isParticipant(room, userId)) {
    throw new ApiError(403, "You are not allowed to access this chat room.");
  }
};

const assertSendingAllowed = (room) => {
  if (!ACTIVE_ASSIGNMENT_STATUSES.includes(room.assignment.status)) {
    throw new ApiError(
      409,
      "Messages cannot be sent after an assignment is completed or cancelled.",
    );
  }
};

const serializeMessage = (message) => ({
  id: message.id,
  roomId: message.chatRoomId,
  senderId: message.senderId,
  clientMessageKey: message.clientMessageKey,
  type: message.messageType,
  text: message.contentText,
  voiceNoteUrl: message.audioUrl,
  voiceNoteDurationSec: message.audioDurationSec,
  isRead: message.isRead,
  readAt: message.readAt,
  sentAt: message.sentAt,
  sender: serializeUser(message.sender),
});

const serializeRoom = (room) => {
  const requester = room.assignment?.errand?.requester || null;
  const traveler = room.assignment?.traveler || null;

  return {
    id: room.id,
    assignmentId: room.assignmentId,
    assignment: {
      id: room.assignment.id,
      status: room.assignment.status,
      errandId: room.assignment.errandId,
      tripId: room.assignment.tripId,
      acceptedAt: room.assignment.acceptedAt,
      completedAt: room.assignment.completedAt,
      cancelledAt: room.assignment.cancelledAt,
      errand: room.assignment.errand
        ? {
            id: room.assignment.errand.id,
            title: room.assignment.errand.title,
            status: room.assignment.errand.status,
          }
        : null,
    },
    participants: {
      requester: serializeUser(requester),
      traveler: serializeUser(traveler),
    },
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
};

const serializeRoomSummary = (room) => ({
  ...serializeRoom(room),
  latestMessage: room.messages?.[0] ? serializeMessage(room.messages[0]) : null,
  unreadCount: room._count?.messages || 0,
});

const normalizePayload = (payload) => {
  if (payload.type === MESSAGE_TYPES.TEXT) {
    return {
      clientMessageKey: payload.clientMessageKey,
      messageType: MESSAGE_TYPES.TEXT,
      contentText: payload.text.trim(),
      audioUrl: null,
      audioDurationSec: null,
    };
  }

  return {
    clientMessageKey: payload.clientMessageKey,
    messageType: MESSAGE_TYPES.VOICE,
    contentText: null,
    audioUrl: payload.voiceNoteUrl.trim(),
    audioDurationSec: payload.voiceNoteDurationSec,
  };
};

const comparableMessage = (message) => ({
  messageType: message.messageType,
  contentText: message.contentText,
  audioUrl: message.audioUrl,
  audioDurationSec: message.audioDurationSec,
});

const assertSamePayload = (existingMessage, normalized) => {
  if (
    JSON.stringify(comparableMessage(existingMessage)) !==
    JSON.stringify({
      messageType: normalized.messageType,
      contentText: normalized.contentText,
      audioUrl: normalized.audioUrl,
      audioDurationSec: normalized.audioDurationSec,
    })
  ) {
    throw new ApiError(
      409,
      "Client message key has already been used with different message data.",
    );
  }
};

const getAuthorizedRoom = async (userId, roomId, client) => {
  const room = await repository.findRoomById(roomId, client);
  assertParticipant(room, userId);
  return room;
};

const listRooms = async (userId) => {
  const rooms = await repository.listRoomsForUser(userId);

  return {
    rooms: rooms.map(serializeRoomSummary),
  };
};

const getRoom = async (userId, roomId) => {
  const room = await getAuthorizedRoom(userId, roomId);

  return {
    room: serializeRoom(room),
  };
};

const resolveBeforeMessage = async (roomId, before) => {
  if (!before) {
    return null;
  }

  const message = await repository.findMessageById(before);

  if (!message || message.chatRoomId !== roomId) {
    throw new ApiError(400, "Before cursor is not valid for this chat room.");
  }

  return message;
};

const listMessages = async (userId, roomId, query = {}) => {
  await getAuthorizedRoom(userId, roomId);

  const limit = query.limit || DEFAULT_MESSAGE_LIMIT;
  const beforeMessage = await resolveBeforeMessage(roomId, query.before);
  const messages = await repository.listMessages({
    roomId,
    limit: limit + 1,
    beforeMessage,
    order: "desc",
  });
  const hasMore = messages.length > limit;
  const pageMessages = messages.slice(0, limit);

  return {
    messages: pageMessages.map(serializeMessage),
    pagination: {
      order: "desc",
      limit,
      hasMore,
      nextBefore: hasMore ? pageMessages[pageMessages.length - 1].id : null,
    },
  };
};

const sendMessage = async (userId, roomId, payload) => {
  const normalized = normalizePayload(payload);

  return repository.runTransaction(async (tx) => {
    const room = await getAuthorizedRoom(userId, roomId, tx);
    assertSendingAllowed(room);

    const existingMessage = await repository.findMessageBySenderAndClientKey(
      userId,
      normalized.clientMessageKey,
      tx,
    );

    if (existingMessage) {
      assertSamePayload(existingMessage, normalized);
      return {
        created: false,
        message: serializeMessage(existingMessage),
      };
    }

    const sentAt = new Date();

    try {
      const message = await repository.createMessage(
        {
          chatRoomId: roomId,
          senderId: userId,
          clientMessageKey: normalized.clientMessageKey,
          messageType: normalized.messageType,
          contentText: normalized.contentText,
          audioUrl: normalized.audioUrl,
          audioDurationSec: normalized.audioDurationSec,
          expiresAt: addDays(sentAt, MESSAGE_RETENTION_DAYS),
        },
        tx,
      );

      await repository.updateRoomLastMessageAt(roomId, message.sentAt, tx);

      return {
        created: true,
        message: serializeMessage(message),
      };
    } catch (error) {
      if (error.code !== "P2002") {
        throw error;
      }

      const existing = await repository.findMessageBySenderAndClientKey(
        userId,
        normalized.clientMessageKey,
        tx,
      );
      if (!existing) {
        throw error;
      }

      assertSamePayload(existing, normalized);

      return {
        created: false,
        message: serializeMessage(existing),
      };
    }
  });
};

const syncMessages = async (userId, roomId, query = {}) => {
  await getAuthorizedRoom(userId, roomId);

  const since = new Date(query.since);
  const serverTime = new Date();
  const limit = query.limit || DEFAULT_MESSAGE_LIMIT;
  const messages = await repository.listMessagesSince({
    roomId,
    since,
    until: serverTime,
    limit,
  });

  return {
    messages: messages.map(serializeMessage),
    sync: {
      serverTime,
      nextSince: serverTime,
      limit,
    },
  };
};

const markRead = async (userId, roomId) => {
  await getAuthorizedRoom(userId, roomId);

  const readAt = new Date();
  const result = await repository.markMessagesRead(roomId, userId, readAt);

  return {
    read: {
      count: result.count,
      readAt,
    },
  };
};

module.exports = {
  getRoom,
  listMessages,
  listRooms,
  markRead,
  sendMessage,
  syncMessages,
};
