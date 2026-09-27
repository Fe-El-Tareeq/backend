const prisma = require("../../config/prisma");
const select = {
  id: true,
  reportCode: true,
  reporterId: true,
  reportedUserId: true,
  assignmentId: true,
  errandId: true,
  tripId: true,
  type: true,
  description: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
};
const reportWithEvidenceSelect = {
  ...select,
  adminNotes: true,
  evidence: {
    select: {
      id: true,
      chatRoomId: true,
      snapshot: true,
      messageCount: true,
      snapshotTakenAt: true,
      createdAt: true,
    },
  },
};
const idempotencySelect = {
  ...select,
  evidence: { select: { chatRoomId: true } },
};
const runTransaction = (callback) => prisma.$transaction(callback);
const findByClientKey = (reporterId, clientRequestKey, client = prisma) =>
  client.supportReport.findUnique({
    where: { reporterId_clientRequestKey: { reporterId, clientRequestKey } },
    select: idempotencySelect,
  });
const create = (data, client = prisma) =>
  client.supportReport.create({ data, select });
const createEvidence = (data, client = prisma) =>
  client.supportReportEvidence.create({ data });
const findById = (id, client = prisma) =>
  client.supportReport.findUnique({ where: { id }, select });
const findAdminById = (id, client = prisma) =>
  client.supportReport.findUnique({
    where: { id },
    select: reportWithEvidenceSelect,
  });
const listMine = ({ reporterId, status, skip, take }) =>
  prisma.supportReport.findMany({
    where: { reporterId, ...(status ? { status } : {}) },
    select,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
const countMine = (reporterId, status) =>
  prisma.supportReport.count({
    where: { reporterId, ...(status ? { status } : {}) },
  });
const listAdmin = ({ status, skip, take }) =>
  prisma.supportReport.findMany({
    where: status ? { status } : {},
    select,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    skip,
    take,
  });
const countAdmin = (status) =>
  prisma.supportReport.count({ where: status ? { status } : {} });
const update = (id, data) =>
  prisma.supportReport.update({ where: { id }, data, select });
const findUserById = (id, client = prisma) =>
  client.user.findUnique({ where: { id }, select: { id: true } });
const findAssignmentContext = (id, client = prisma) =>
  client.errandAssignment.findUnique({
    where: { id },
    select: {
      id: true,
      travelerId: true,
      traveler: { select: { id: true, fullName: true } },
      tripId: true,
      errand: {
        select: {
          id: true,
          requesterId: true,
          requester: { select: { id: true, fullName: true } },
        },
      },
      chatRoom: { select: { id: true } },
    },
  });
const findErrandContext = (id, client = prisma) =>
  client.errand.findUnique({
    where: { id },
    select: {
      id: true,
      requesterId: true,
      assignments: { select: { travelerId: true, tripId: true } },
    },
  });
const findTripContext = (id, client = prisma) =>
  client.trip.findUnique({
    where: { id },
    select: {
      id: true,
      travelerId: true,
      assignments: {
        select: { travelerId: true, errand: { select: { requesterId: true } } },
      },
    },
  });
const findChatRoomContext = (id, client = prisma) =>
  client.chatRoom.findUnique({
    where: { id },
    select: {
      id: true,
      assignment: {
        select: {
          id: true,
          travelerId: true,
          traveler: { select: { id: true, fullName: true } },
          tripId: true,
          errand: {
            select: {
              id: true,
              requesterId: true,
              requester: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });
const listLatestChatMessages = (chatRoomId, take = 50, client = prisma) =>
  client.chatMessage.findMany({
    where: { chatRoomId },
    select: {
      id: true,
      senderId: true,
      messageType: true,
      contentText: true,
      audioUrl: true,
      audioDurationSec: true,
      audioSizeBytes: true,
      audioMimeType: true,
      imageUrl: true,
      imageSizeBytes: true,
      imageMimeType: true,
      sentAt: true,
      sender: { select: { id: true, fullName: true } },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take,
  });
module.exports = {
  runTransaction,
  findByClientKey,
  create,
  createEvidence,
  findById,
  findAdminById,
  listMine,
  countMine,
  listAdmin,
  countAdmin,
  update,
  findUserById,
  findAssignmentContext,
  findErrandContext,
  findTripContext,
  findChatRoomContext,
  listLatestChatMessages,
};
