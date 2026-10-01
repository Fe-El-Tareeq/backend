process.env.NODE_ENV = "test";
jest.mock("../src/features/reports/reports.repository");
jest.mock("../src/services/email.service", () => ({
  sendReportNotification: jest.fn().mockResolvedValue({ sent: true }),
}));
const repository = require("../src/features/reports/reports.repository");
const service = require("../src/features/reports/reports.service");

const reporterId = "550e8400-e29b-41d4-a716-446655440001";
const travelerId = "550e8400-e29b-41d4-a716-446655440002";
const assignmentId = "650e8400-e29b-41d4-a716-446655440001";
const errandId = "650e8400-e29b-41d4-a716-446655440002";
const tripId = "650e8400-e29b-41d4-a716-446655440003";
const roomId = "650e8400-e29b-41d4-a716-446655440004";
const clientRequestKey = "750e8400-e29b-41d4-a716-446655440001";
const user = { id: reporterId, role: "USER" };
const room = {
  id: roomId,
  assignment: {
    id: assignmentId,
    travelerId,
    traveler: { id: travelerId, fullName: "Traveler" },
    tripId,
    errand: {
      id: errandId,
      requesterId: reporterId,
      requester: { id: reporterId, fullName: "Requester" },
    },
  },
};
const payload = {
  clientRequestKey,
  type: "ABUSE_OR_THREAT",
  description: "The traveler sent threatening messages.",
  reportedUserId: travelerId,
  attachChatHistory: true,
  chatRoomId: roomId,
};
const report = {
  id: "850e8400-e29b-41d4-a716-446655440001",
  reportCode: "RPT-ABC123",
  reporterId,
  reportedUserId: travelerId,
  assignmentId,
  errandId,
  tripId,
  clientRequestKey,
  type: payload.type,
  description: payload.description,
  priority: "HIGH",
};

beforeEach(() => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) => callback({}));
  repository.findByClientKey.mockResolvedValue(null);
  repository.findUserById.mockResolvedValue({ id: travelerId });
  repository.findChatRoomContext.mockResolvedValue(room);
  repository.create.mockResolvedValue(report);
  repository.createEvidence.mockResolvedValue({ id: "evidence-1" });
  repository.listLatestChatMessages.mockResolvedValue([
    {
      id: "950e8400-e29b-41d4-a716-446655440002",
      senderId: travelerId,
      sender: { id: travelerId, fullName: "Traveler" },
      messageType: "IMAGE",
      contentText: null,
      imageUrl: "https://media.example/image.webp",
      imageSizeBytes: 100,
      imageMimeType: "image/webp",
      sentAt: new Date("2026-09-27T10:02:00Z"),
    },
    {
      id: "950e8400-e29b-41d4-a716-446655440001",
      senderId: reporterId,
      sender: { id: reporterId, fullName: "Requester" },
      messageType: "TEXT",
      contentText: "Please stop.",
      sentAt: new Date("2026-09-27T10:01:00Z"),
    },
  ]);
});

test("creates an atomic immutable snapshot in chronological order", async () => {
  const result = await service.create(user, payload);
  expect(result.created).toBe(true);
  expect(repository.listLatestChatMessages).toHaveBeenCalledWith(roomId, 50, expect.anything());
  const evidence = repository.createEvidence.mock.calls[0][0];
  expect(evidence.reportId).toBe(report.id);
  expect(evidence.messageCount).toBe(2);
  expect(evidence.snapshot.messages.map((message) => message.messageType)).toEqual(["TEXT", "IMAGE"]);
  expect(evidence.snapshot.messages[1].media).toMatchObject({
    url: "https://media.example/image.webp",
    mimeType: "image/webp",
  });
});

test("rejects a chat room unrelated to the reporter", async () => {
  repository.findChatRoomContext.mockResolvedValue({
    ...room,
    assignment: {
      ...room.assignment,
      travelerId: "550e8400-e29b-41d4-a716-446655440010",
      errand: {
        ...room.assignment.errand,
        requesterId: "550e8400-e29b-41d4-a716-446655440011",
      },
    },
  });
  await expect(service.create(user, payload)).rejects.toMatchObject({ statusCode: 404 });
  expect(repository.create).not.toHaveBeenCalled();
});

test("rejects a reported user who is not the other participant", async () => {
  repository.findUserById.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440099" });
  await expect(
    service.create(user, {
      ...payload,
      reportedUserId: "550e8400-e29b-41d4-a716-446655440099",
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("does not expose evidence when replaying an identical request", async () => {
  repository.findByClientKey.mockResolvedValue({
    ...report,
    evidence: { chatRoomId: roomId },
  });
  const result = await service.create(user, payload);
  expect(result.created).toBe(false);
  expect(result.report.evidence).toBeUndefined();
  expect(repository.createEvidence).not.toHaveBeenCalled();
});

test.each([
  ["assignmentId", assignmentId, "findAssignmentContext", {
    id: assignmentId,
    travelerId: "550e8400-e29b-41d4-a716-446655440010",
    tripId: null,
    errand: { id: errandId, requesterId: "550e8400-e29b-41d4-a716-446655440011" },
  }],
  ["errandId", errandId, "findErrandContext", {
    id: errandId,
    requesterId: "550e8400-e29b-41d4-a716-446655440011",
    assignments: [],
  }],
  ["tripId", tripId, "findTripContext", {
    id: tripId,
    travelerId: "550e8400-e29b-41d4-a716-446655440010",
    assignments: [],
  }],
])("rejects an unrelated %s", async (field, value, method, context) => {
  repository[method].mockResolvedValue(context);
  await expect(
    service.create(user, {
      clientRequestKey,
      type: "OTHER",
      description: "This is an unrelated report context.",
      attachChatHistory: false,
      [field]: value,
    }),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(repository.create).not.toHaveBeenCalled();
});

test("fails the whole operation when evidence persistence fails", async () => {
  repository.createEvidence.mockRejectedValue(new Error("snapshot failed"));
  await expect(service.create(user, payload)).rejects.toThrow("snapshot failed");
});
