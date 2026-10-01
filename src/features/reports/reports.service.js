const { randomUUID } = require("crypto");
const ApiError = require("../../utils/ApiError");
const repository = require("./reports.repository");
const { priorityFor } = require("./reports.constants");
const emailService = require("../../services/email.service");
const {
  isDashboardAdmin,
} = require("../adminAuth/adminAuth.policy");

const admin = isDashboardAdmin;
const contextNotFound = () => new ApiError(404, "Report context not found.");
const isParticipant = (userId, requesterId, travelerId) =>
  userId === requesterId || userId === travelerId;

const validateAndNormalizeContext = async (userId, payload, tx) => {
  const [assignment, errand, trip, chatRoom] = await Promise.all([
    payload.assignmentId
      ? repository.findAssignmentContext(payload.assignmentId, tx)
      : null,
    payload.errandId
      ? repository.findErrandContext(payload.errandId, tx)
      : null,
    payload.tripId ? repository.findTripContext(payload.tripId, tx) : null,
    payload.chatRoomId
      ? repository.findChatRoomContext(payload.chatRoomId, tx)
      : null,
  ]);

  if (
    (payload.assignmentId && !assignment) ||
    (payload.errandId && !errand) ||
    (payload.tripId && !trip) ||
    (payload.chatRoomId && !chatRoom)
  )
    throw contextNotFound();

  const effectiveAssignment = chatRoom?.assignment || assignment;
  if (
    assignment &&
    !isParticipant(userId, assignment.errand.requesterId, assignment.travelerId)
  ) {
    throw contextNotFound();
  }
  if (
    chatRoom &&
    !isParticipant(
      userId,
      chatRoom.assignment.errand.requesterId,
      chatRoom.assignment.travelerId,
    )
  ) {
    throw contextNotFound();
  }
  if (assignment && chatRoom && assignment.id !== chatRoom.assignment.id) {
    throw new ApiError(
      400,
      "Report context fields do not refer to the same assignment.",
    );
  }

  if (errand) {
    const participates =
      errand.requesterId === userId ||
      errand.assignments.some((item) => item.travelerId === userId);
    if (!participates) throw contextNotFound();
  }
  if (trip) {
    const participates =
      trip.travelerId === userId ||
      trip.assignments.some((item) => item.errand.requesterId === userId);
    if (!participates) throw contextNotFound();
  }

  const normalized = {
    assignmentId: effectiveAssignment?.id || payload.assignmentId || null,
    errandId: effectiveAssignment?.errand.id || payload.errandId || null,
    tripId: effectiveAssignment
      ? effectiveAssignment.tripId
      : payload.tripId || null,
  };
  if (payload.errandId && normalized.errandId !== payload.errandId) {
    throw new ApiError(400, "errandId does not match the assignment context.");
  }
  if (payload.tripId && normalized.tripId !== payload.tripId) {
    throw new ApiError(400, "tripId does not match the assignment context.");
  }
  if (
    payload.errandId &&
    payload.tripId &&
    !errand.assignments.some((item) => item.tripId === payload.tripId)
  ) {
    throw new ApiError(400, "errandId and tripId are not related.");
  }

  if (payload.reportedUserId && effectiveAssignment) {
    const counterpartId =
      userId === effectiveAssignment.travelerId
        ? effectiveAssignment.errand.requesterId
        : effectiveAssignment.travelerId;
    if (payload.reportedUserId !== counterpartId) {
      throw new ApiError(
        400,
        "reportedUserId must be the other assignment participant.",
      );
    }
  } else if (payload.reportedUserId && errand) {
    const relatedUserIds =
      errand.requesterId === userId
        ? errand.assignments.map((item) => item.travelerId)
        : [errand.requesterId];
    if (!relatedUserIds.includes(payload.reportedUserId)) {
      throw new ApiError(400, "reportedUserId is not related to this errand.");
    }
  } else if (payload.reportedUserId && trip) {
    const relatedUserIds =
      trip.travelerId === userId
        ? trip.assignments.map((item) => item.errand.requesterId)
        : [trip.travelerId];
    if (!relatedUserIds.includes(payload.reportedUserId)) {
      throw new ApiError(400, "reportedUserId is not related to this trip.");
    }
  } else if (payload.reportedUserId) {
    const reportedUser = await repository.findUserById(
      payload.reportedUserId,
      tx,
    );
    if (!reportedUser) throw contextNotFound();
  }
  return { normalized, chatRoom };
};

const buildSnapshot = (chatRoom, messages, snapshotTakenAt) => ({
  chatRoomId: chatRoom.id,
  assignmentId: chatRoom.assignment.id,
  participants: [
    {
      id: chatRoom.assignment.errand.requester.id,
      displayName: chatRoom.assignment.errand.requester.fullName,
    },
    {
      id: chatRoom.assignment.traveler.id,
      displayName: chatRoom.assignment.traveler.fullName,
    },
  ],
  snapshotTakenAt: snapshotTakenAt.toISOString(),
  messages: [...messages].reverse().map((message) => ({
    originalMessageId: message.id,
    senderId: message.senderId,
    senderDisplayName: message.sender.fullName,
    messageType: message.messageType,
    contentText: message.contentText,
    sentAt: message.sentAt.toISOString(),
    media:
      message.messageType === "VOICE"
        ? {
            url: message.audioUrl,
            durationSec: message.audioDurationSec,
            sizeBytes: message.audioSizeBytes,
            mimeType: message.audioMimeType,
          }
        : message.messageType === "IMAGE"
          ? {
              url: message.imageUrl,
              sizeBytes: message.imageSizeBytes,
              mimeType: message.imageMimeType,
            }
          : null,
  })),
});

const sameReportRequest = (existing, payload, normalized) =>
  existing.type === payload.type &&
  existing.description === payload.description &&
  (existing.reportedUserId || null) === (payload.reportedUserId || null) &&
  (existing.assignmentId || null) === normalized.assignmentId &&
  (existing.errandId || null) === normalized.errandId &&
  (existing.tripId || null) === normalized.tripId &&
  Boolean(existing.evidence) === payload.attachChatHistory &&
  (existing.evidence?.chatRoomId || null) === (payload.chatRoomId || null);

const createInTransaction = (user, payload) =>
  repository.runTransaction(async (tx) => {
    const { normalized, chatRoom } = await validateAndNormalizeContext(
      user.id,
      payload,
      tx,
    );
    const existing = await repository.findByClientKey(
      user.id,
      payload.clientRequestKey,
      tx,
    );
    if (existing) {
      if (!sameReportRequest(existing, payload, normalized)) {
        throw new ApiError(
          409,
          "clientRequestKey was already used with different report data.",
        );
      }
      const { evidence, ...report } = existing;
      return { created: false, report };
    }

    const report = await repository.create(
      {
        id: randomUUID(),
        reportCode: `RPT-${randomUUID().slice(0, 6).toUpperCase()}`,
        reporterId: user.id,
        reportedUserId: payload.reportedUserId || null,
        assignmentId: normalized.assignmentId,
        errandId: normalized.errandId,
        tripId: normalized.tripId,
        clientRequestKey: payload.clientRequestKey,
        type: payload.type,
        description: payload.description,
        priority: priorityFor(payload.type),
      },
      tx,
    );

    if (payload.attachChatHistory) {
      const snapshotTakenAt = new Date();
      const messages = await repository.listLatestChatMessages(
        payload.chatRoomId,
        50,
        tx,
      );
      await repository.createEvidence(
        {
          reportId: report.id,
          chatRoomId: payload.chatRoomId,
          snapshot: buildSnapshot(chatRoom, messages, snapshotTakenAt),
          messageCount: messages.length,
          snapshotTakenAt,
        },
        tx,
      );
    }
    return { created: true, report };
  });

const create = async (user, payload) => {
  if (payload.reportedUserId === user.id) {
    throw new ApiError(400, "Users cannot report themselves.");
  }
  let result;
  try {
    result = await createInTransaction(user, payload);
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await repository.findByClientKey(
      user.id,
      payload.clientRequestKey,
    );
    if (!existing) throw error;
    const { normalized } = await repository.runTransaction((tx) =>
      validateAndNormalizeContext(user.id, payload, tx),
    );
    if (!sameReportRequest(existing, payload, normalized)) {
      throw new ApiError(
        409,
        "clientRequestKey was already used with different report data.",
      );
    }
    const { evidence, ...report } = existing;
    result = { created: false, report };
  }

  if (result.created) {
    await emailService
      .sendReportNotification(result.report, user)
      .catch((error) => {
        console.error(
          `Failed to email report ${result.report.reportCode}:`,
          error.message,
        );
        return { sent: false, reason: "EMAIL_DELIVERY_FAILED" };
      });
  }
  return result;
};

const listMine = async (user, query) => {
  const [reports, total] = await Promise.all([
    repository.listMine({ reporterId: user.id, ...query }),
    repository.countMine(user.id, query.status),
  ]);
  return { reports, pagination: { ...query, total } };
};
const get = async (user, id) => {
  const report = await repository.findById(id);
  if (!report || (report.reporterId !== user.id && !admin(user))) {
    throw new ApiError(404, "Report not found.");
  }
  return { report };
};
const listAdmin = async (user, query) => {
  if (!admin(user))
    throw new ApiError(403, "Administrator access is required.");
  const [reports, total] = await Promise.all([
    repository.listAdmin(query),
    repository.countAdmin(query.status),
  ]);
  return { reports, pagination: { ...query, total } };
};
const getAdmin = async (user, id) => {
  if (!admin(user))
    throw new ApiError(403, "Administrator access is required.");
  const report = await repository.findAdminById(id);
  if (!report) throw new ApiError(404, "Report not found.");
  return { report };
};
const update = async (user, id, payload) => {
  if (!admin(user))
    throw new ApiError(403, "Administrator access is required.");
  if (!(await repository.findById(id)))
    throw new ApiError(404, "Report not found.");
  return {
    report: await repository.update(id, {
      ...payload,
      resolvedAt: ["RESOLVED", "REJECTED"].includes(payload.status)
        ? new Date()
        : null,
    }),
  };
};

module.exports = { create, listMine, get, listAdmin, getAdmin, update };
