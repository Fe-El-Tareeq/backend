process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/chat/chat.repository");
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));

const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/chat/chat.repository");
const service = require("../src/features/chat/chat.service");

const requesterId = "550e8400-e29b-41d4-a716-446655440000";
const travelerId = "550e8400-e29b-41d4-a716-446655440001";
const unrelatedUserId = "550e8400-e29b-41d4-a716-446655440002";
const roomId = "650e8400-e29b-41d4-a716-446655440000";
const assignmentId = "750e8400-e29b-41d4-a716-446655440000";
const errandId = "850e8400-e29b-41d4-a716-446655440000";
const messageId = "950e8400-e29b-41d4-a716-446655440000";
const clientMessageKey = "150e8400-e29b-41d4-a716-446655440000";
const secondClientMessageKey = "250e8400-e29b-41d4-a716-446655440000";

const requesterToken = jwt.sign(
  { type: "access", userId: requesterId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);
const travelerToken = jwt.sign(
  { type: "access", userId: travelerId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);
const unrelatedToken = jwt.sign(
  { type: "access", userId: unrelatedUserId, role: "USER" },
  process.env.JWT_ACCESS_SECRET,
);

const makeUser = (id, fullName) => ({
  id,
  fullName,
  phone: "+970599000000",
  role: "USER",
  status: "ACTIVE",
  trustScore: 80,
  profileImageUrl: null,
});

const makeRoom = (overrides = {}) => ({
  id: roomId,
  assignmentId,
  createdAt: new Date("2026-08-29T08:00:00.000Z"),
  updatedAt: new Date("2026-08-29T08:00:00.000Z"),
  lastMessageAt: new Date("2026-08-29T08:05:00.000Z"),
  assignment: {
    id: assignmentId,
    errandId,
    travelerId,
    tripId: null,
    status: "ACCEPTED",
    acceptedAt: new Date("2026-08-29T08:00:00.000Z"),
    completedAt: null,
    cancelledAt: null,
    errand: {
      id: errandId,
      requesterId,
      title: "Bring medicine",
      status: "ASSIGNED",
      requester: makeUser(requesterId, "Requester"),
    },
    traveler: makeUser(travelerId, "Traveler"),
  },
  ...overrides,
});

const makeMessage = (overrides = {}) => ({
  id: messageId,
  chatRoomId: roomId,
  senderId: requesterId,
  clientMessageKey,
  messageType: "TEXT",
  contentText: "I'm on the way",
  audioUrl: null,
  audioDurationSec: null,
  isRead: false,
  sentAt: new Date("2026-08-29T08:10:00.000Z"),
  readAt: null,
  expiresAt: new Date("2026-09-28T08:10:00.000Z"),
  sender: makeUser(requesterId, "Requester"),
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
  repository.runTransaction.mockImplementation((callback) => callback({ tx: true }));
  repository.findRoomById.mockResolvedValue(makeRoom());
  repository.findMessageBySenderAndClientKey.mockResolvedValue(null);
  repository.createMessage.mockImplementation(async (data) => makeMessage(data));
  repository.updateRoomLastMessageAt.mockResolvedValue({ id: roomId });
  repository.findMessageById.mockResolvedValue(makeMessage());
  repository.listMessages.mockResolvedValue([makeMessage()]);
  repository.listMessagesSince.mockResolvedValue([makeMessage()]);
  repository.markMessagesRead.mockResolvedValue({ count: 2 });
  repository.listRoomsForUser.mockResolvedValue([
    {
      ...makeRoom(),
      messages: [makeMessage()],
      _count: { messages: 1 },
    },
  ]);
});

describe("Chat authorization", () => {
  test("requester can access own chat", async () => {
    const result = await service.getRoom(requesterId, roomId);

    expect(result.room.id).toBe(roomId);
    expect(result.room.participants.requester.id).toBe(requesterId);
  });

  test("traveler can access own chat", async () => {
    const result = await service.getRoom(travelerId, roomId);

    expect(result.room.id).toBe(roomId);
    expect(result.room.participants.traveler.id).toBe(travelerId);
  });

  test("unrelated user cannot access room", async () => {
    await expect(service.getRoom(unrelatedUserId, roomId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("unauthenticated user is rejected", async () => {
    const response = await request(app).get(`/api/v1/chat-rooms/${roomId}`);

    expect(response.statusCode).toBe(401);
  });
});

describe("Chat text messages", () => {
  test("send valid text", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        clientMessageKey,
        type: "TEXT",
        text: "  I'm on the way  ",
      });

    expect(response.statusCode).toBe(201);
    expect(repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "TEXT",
        contentText: "I'm on the way",
        audioUrl: null,
      }),
      expect.anything(),
    );
  });

  test("reject empty text", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ clientMessageKey, type: "TEXT", text: "   " });

    expect(response.statusCode).toBe(400);
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  test("reject text over 500 chars", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ clientMessageKey, type: "TEXT", text: "x".repeat(501) });

    expect(response.statusCode).toBe(400);
    expect(repository.createMessage).not.toHaveBeenCalled();
  });
});

describe("Chat voice messages", () => {
  test("send valid voice metadata", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${travelerToken}`)
      .send({
        clientMessageKey,
        type: "VOICE",
        voiceNoteUrl: "https://media.example.test/voice/1.ogg",
        voiceNoteDurationSec: 18,
      });

    expect(response.statusCode).toBe(201);
    expect(repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: travelerId,
        messageType: "VOICE",
        contentText: null,
        audioUrl: "https://media.example.test/voice/1.ogg",
        audioDurationSec: 18,
      }),
      expect.anything(),
    );
  });

  test("reject voice over 30 sec", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        clientMessageKey,
        type: "VOICE",
        voiceNoteUrl: "https://media.example.test/voice/1.ogg",
        voiceNoteDurationSec: 31,
      });

    expect(response.statusCode).toBe(400);
  });

  test("reject missing voice URL", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        clientMessageKey,
        type: "VOICE",
        voiceNoteDurationSec: 18,
      });

    expect(response.statusCode).toBe(400);
  });

  test("reject invalid mixed payload", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/messages`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        clientMessageKey,
        type: "TEXT",
        text: "Hello",
        voiceNoteUrl: "https://media.example.test/voice/1.ogg",
      });

    expect(response.statusCode).toBe(400);
  });
});

describe("Chat idempotency", () => {
  test("same clientMessageKey and same payload creates exactly one message", async () => {
    const payload = { clientMessageKey, type: "TEXT", text: "I'm on the way" };

    await service.sendMessage(requesterId, roomId, payload);
    repository.findMessageBySenderAndClientKey.mockResolvedValue(makeMessage());
    await service.sendMessage(requesterId, roomId, payload);

    expect(repository.createMessage).toHaveBeenCalledTimes(1);
  });

  test("retry returns existing message", async () => {
    repository.findMessageBySenderAndClientKey.mockResolvedValue(makeMessage());

    const result = await service.sendMessage(requesterId, roomId, {
      clientMessageKey,
      type: "TEXT",
      text: "I'm on the way",
    });

    expect(result.created).toBe(false);
    expect(result.message.id).toBe(messageId);
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  test("same key with different payload returns 409", async () => {
    repository.findMessageBySenderAndClientKey.mockResolvedValue(makeMessage());

    await expect(
      service.sendMessage(requesterId, roomId, {
        clientMessageKey,
        type: "TEXT",
        text: "Different",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("keys are scoped correctly to sender", async () => {
    await service.sendMessage(requesterId, roomId, {
      clientMessageKey,
      type: "TEXT",
      text: "I'm on the way",
    });
    await service.sendMessage(travelerId, roomId, {
      clientMessageKey,
      type: "TEXT",
      text: "I'm on the way",
    });

    expect(repository.findMessageBySenderAndClientKey).toHaveBeenNthCalledWith(
      1,
      requesterId,
      clientMessageKey,
      expect.anything(),
    );
    expect(repository.findMessageBySenderAndClientKey).toHaveBeenNthCalledWith(
      2,
      travelerId,
      clientMessageKey,
      expect.anything(),
    );
    expect(repository.createMessage).toHaveBeenCalledTimes(2);
  });
});

describe("Chat listing", () => {
  test("participant lists messages", async () => {
    const response = await request(app)
      .get(`/api/v1/chat-rooms/${roomId}/messages?limit=30`)
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.data.messages).toHaveLength(1);
  });

  test("pagination works", async () => {
    const messages = Array.from({ length: 31 }, (_, index) =>
      makeMessage({
        id: `950e8400-e29b-41d4-a716-4466554400${String(index).padStart(2, "0")}`,
        sentAt: new Date(`2026-08-29T08:${String(index).padStart(2, "0")}:00.000Z`),
      }),
    );
    repository.listMessages.mockResolvedValue(messages);

    const result = await service.listMessages(requesterId, roomId, { limit: 30 });

    expect(result.messages).toHaveLength(30);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextBefore).toBe(messages[29].id);
  });

  test("ordering is deterministic", async () => {
    await service.listMessages(requesterId, roomId, { limit: 30, before: messageId });

    expect(repository.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeMessage: expect.objectContaining({ id: messageId }),
        order: "desc",
      }),
    );
  });

  test("unrelated user cannot list", async () => {
    await expect(
      service.listMessages(unrelatedUserId, roomId, { limit: 30 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("Chat sync", () => {
  test("since returns only newer messages", async () => {
    const since = "2026-08-29T08:00:00.000Z";

    await service.syncMessages(requesterId, roomId, { since, limit: 30 });

    expect(repository.listMessagesSince).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId,
        since: new Date(since),
        until: expect.any(Date),
        limit: 30,
      }),
    );
  });

  test("sync does not return old history", async () => {
    await request(app)
      .get(`/api/v1/chat-rooms/${roomId}/sync`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .expect(400);
  });

  test("next sync cursor time is usable", async () => {
    const result = await service.syncMessages(requesterId, roomId, {
      since: "2026-08-29T08:00:00.000Z",
      limit: 30,
    });

    expect(new Date(result.sync.nextSince).toString()).not.toBe("Invalid Date");
  });

  test("empty sync returns clean empty result", async () => {
    repository.listMessagesSince.mockResolvedValue([]);

    const result = await service.syncMessages(requesterId, roomId, {
      since: "2026-08-29T08:00:00.000Z",
      limit: 30,
    });

    expect(result.messages).toEqual([]);
  });
});

describe("Chat lifecycle and leakage", () => {
  test("sending allowed while active", async () => {
    await expect(
      service.sendMessage(requesterId, roomId, {
        clientMessageKey,
        type: "TEXT",
        text: "Active",
      }),
    ).resolves.toMatchObject({ created: true });
  });

  test("sending blocked when assignment COMPLETED", async () => {
    repository.findRoomById.mockResolvedValue(
      makeRoom({ assignment: { ...makeRoom().assignment, status: "COMPLETED" } }),
    );

    await expect(
      service.sendMessage(requesterId, roomId, {
        clientMessageKey,
        type: "TEXT",
        text: "Closed",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("sending blocked when assignment CANCELLED", async () => {
    repository.findRoomById.mockResolvedValue(
      makeRoom({ assignment: { ...makeRoom().assignment, status: "CANCELLED" } }),
    );

    await expect(
      service.sendMessage(requesterId, roomId, {
        clientMessageKey,
        type: "TEXT",
        text: "Closed",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("history still readable after completion or cancellation", async () => {
    repository.findRoomById.mockResolvedValue(
      makeRoom({ assignment: { ...makeRoom().assignment, status: "COMPLETED" } }),
    );

    await expect(
      service.listMessages(requesterId, roomId, { limit: 30 }),
    ).resolves.toMatchObject({
      messages: expect.any(Array),
    });
  });

  test("responses do not expose sensitive user fields", async () => {
    const result = await service.getRoom(requesterId, roomId);

    expect(result.room.participants.requester.phone).toBeUndefined();
    expect(result.room.participants.traveler.phone).toBeUndefined();
  });

  test("participant can mark incoming messages read", async () => {
    const response = await request(app)
      .post(`/api/v1/chat-rooms/${roomId}/read`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({});

    expect(response.statusCode).toBe(200);
    expect(response.body.data.read.count).toBe(2);
    expect(repository.markMessagesRead).toHaveBeenCalledWith(
      roomId,
      requesterId,
      expect.any(Date),
    );
  });

  test("unrelated user cannot mark messages read", async () => {
    await expect(service.markRead(unrelatedUserId, roomId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("user sees only own rooms", async () => {
    const result = await service.listRooms(requesterId);

    expect(repository.listRoomsForUser).toHaveBeenCalledWith(requesterId);
    expect(result.rooms).toHaveLength(1);
  });

  test("latest message summary is correct", async () => {
    const result = await service.listRooms(requesterId);

    expect(result.rooms[0].latestMessage.id).toBe(messageId);
    expect(result.rooms[0].unreadCount).toBe(1);
  });
});
