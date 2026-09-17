const ApiError = require("../../utils/ApiError");
const assignmentService = require("../assignments/assignments.service");
const notificationService = require("../notifications/notifications.service");
const repository = require("./proposals.repository");

const displayUser = (user) => {
  if (!user) return user;
  const { _count, ...safe } = user;
  return { ...safe, completedDeliveries: _count?.assignments || 0 };
};

const serialize = (proposal) => ({
  ...proposal,
  initiatedBy: displayUser(proposal.initiatedBy),
  errand: proposal.errand
    ? { ...proposal.errand, requester: displayUser(proposal.errand.requester) }
    : proposal.errand,
  trip: proposal.trip
    ? { ...proposal.trip, traveler: displayUser(proposal.trip.traveler) }
    : proposal.trip,
});

const sameCreateRequest = (proposal, payload) =>
  proposal.errandId === payload.errandId &&
  proposal.tripId === payload.tripId &&
  proposal.type === payload.type &&
  (proposal.message || null) === (payload.message || null);

const receiverIdFor = (proposal) =>
  proposal.type === "TRAVELER_OFFER"
    ? proposal.errand.requesterId
    : proposal.trip.travelerId;

const assertCreateOwnership = ({ userId, type, errand, trip }) => {
  if (!errand) throw new ApiError(404, "Errand not found.");
  if (!trip) throw new ApiError(404, "Trip not found.");
  if (errand.requesterId === trip.travelerId) {
    throw new ApiError(
      400,
      "A user cannot create a proposal for their own errand and trip.",
    );
  }
  if (type === "TRAVELER_OFFER" && trip.travelerId !== userId) {
    throw new ApiError(403, "Only the trip owner can send a traveler offer.");
  }
  if (type === "REQUESTER_REQUEST" && errand.requesterId !== userId) {
    throw new ApiError(
      403,
      "Only the errand owner can send a requester request.",
    );
  }
};

const createProposal = async (userId, payload) => {
  const normalized = { ...payload, message: payload.message?.trim() || null };
  try {
    return await repository.runTransaction(async (tx) => {
      const existing = await repository.findByInitiatorAndKey(
        userId,
        normalized.clientRequestKey,
        tx,
      );
      if (existing) {
        if (!sameCreateRequest(existing, normalized)) {
          throw new ApiError(
            409,
            "Client request key was already used with different proposal data.",
          );
        }
        return { created: false, proposal: serialize(existing) };
      }

      const [errand, trip] = await Promise.all([
        repository.findErrand(normalized.errandId, tx),
        repository.findTrip(normalized.tripId, tx),
      ]);
      assertCreateOwnership({ userId, type: normalized.type, errand, trip });
      const now = new Date();
      assignmentService.assertCompatiblePair({
        errand,
        trip,
        travelerId: trip.travelerId,
        now,
      });

      const expiresAt = new Date(
        Math.min(
          new Date(errand.expiresAt).getTime(),
          new Date(trip.expiresAt).getTime(),
        ),
      );
      const proposal = await repository.create(
        {
          errandId: normalized.errandId,
          tripId: normalized.tripId,
          initiatedById: userId,
          clientRequestKey: normalized.clientRequestKey,
          type: normalized.type,
          message: normalized.message,
          expiresAt,
        },
        tx,
      );
      await notificationService.templates.newProposal(
        {
          recipientId: receiverIdFor(proposal),
          proposalId: proposal.id,
          errandId: proposal.errandId,
          tripId: proposal.tripId,
          proposalType: proposal.type,
        },
        tx,
      );
      return { created: true, proposal: serialize(proposal) };
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new ApiError(
        409,
        "A proposal for this errand and trip already exists.",
      );
    }
    throw error;
  }
};

const buildSummary = (rows) => {
  const counts = {
    PENDING: 0,
    ACCEPTED: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
    EXPIRED: 0,
  };
  rows.forEach((row) => {
    if (counts[row.status] !== undefined) counts[row.status] = row._count._all;
  });
  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    pending: counts.PENDING,
    accepted: counts.ACCEPTED,
    rejected: counts.REJECTED,
    withdrawn: counts.WITHDRAWN,
    expired: counts.EXPIRED,
  };
};

const listForResource = async ({
  userId,
  resource,
  resourceId,
  status,
  skip,
  take,
}) => {
  const resourceRecord =
    resource === "errand"
      ? await repository.findErrand(resourceId)
      : await repository.findTrip(resourceId);
  if (!resourceRecord)
    throw new ApiError(
      404,
      `${resource === "errand" ? "Errand" : "Trip"} not found.`,
    );
  const ownerId =
    resource === "errand"
      ? resourceRecord.requesterId
      : resourceRecord.travelerId;
  if (ownerId !== userId)
    throw new ApiError(
      403,
      "Only the resource owner can view incoming proposals.",
    );

  const resourceWhere =
    resource === "errand"
      ? { errandId: resourceId, type: "TRAVELER_OFFER" }
      : { tripId: resourceId, type: "REQUESTER_REQUEST" };
  await repository.expirePending(resourceWhere, new Date());
  const visibleWhere = resourceWhere;
  const listWhere = status ? { ...resourceWhere, status } : visibleWhere;
  const [proposals, total, statusRows] = await Promise.all([
    repository.list({ where: listWhere, skip, take }),
    repository.count(listWhere),
    repository.countByStatus(visibleWhere),
  ]);
  return {
    proposals: proposals.map(serialize),
    summary: buildSummary(statusRows),
    pagination: { skip, take, total },
  };
};

const listErrandProposals = (userId, errandId, filters) =>
  listForResource({
    userId,
    resource: "errand",
    resourceId: errandId,
    ...filters,
  });
const listTripProposals = (userId, tripId, filters) =>
  listForResource({ userId, resource: "trip", resourceId: tripId, ...filters });

const listUserProposals = async (userId, filters, direction) => {
  const baseWhere =
    direction === "sent"
      ? { initiatedById: userId }
      : {
          OR: [
            { type: "TRAVELER_OFFER", errand: { requesterId: userId } },
            { type: "REQUESTER_REQUEST", trip: { travelerId: userId } },
          ],
        };
  await repository.expirePending(baseWhere, new Date());
  const listWhere = {
    ...baseWhere,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.unread === true ? { readAt: null } : {}),
    ...(filters.unread === false ? { readAt: { not: null } } : {}),
  };
  const [proposals, total, statusRows] = await Promise.all([
    repository.list({
      where: listWhere,
      skip: filters.skip,
      take: filters.take,
    }),
    repository.count(listWhere),
    repository.countByStatus(baseWhere),
  ]);
  return {
    proposals: proposals.map(serialize),
    summary: buildSummary(statusRows),
    pagination: { skip: filters.skip, take: filters.take, total },
  };
};

const listInbox = (userId, filters) =>
  listUserProposals(userId, filters, "inbox");
const listSent = (userId, filters) =>
  listUserProposals(userId, filters, "sent");

const markProposalRead = (userId, proposalId) =>
  repository.runTransaction(async (tx) => {
    const proposal = await repository.lockById(proposalId, tx);
    if (!proposal) throw new ApiError(404, "Proposal not found.");
    if (receiverIdFor(proposal) !== userId) {
      throw new ApiError(403, "Only the proposal receiver can mark it read.");
    }
    if (proposal.readAt) return serialize(proposal);
    return serialize(await repository.markRead(proposalId, new Date(), tx));
  });

const withdrawProposal = async (userId, proposalId) => {
  const result = await repository.runTransaction(async (tx) => {
    const proposal = await repository.lockById(proposalId, tx);
    if (!proposal) throw new ApiError(404, "Proposal not found.");
    if (proposal.initiatedById !== userId) {
      throw new ApiError(403, "Only the proposal sender can withdraw it.");
    }
    if (proposal.status === "WITHDRAWN") return serialize(proposal);
    if (proposal.status !== "PENDING") {
      throw new ApiError(409, "Only pending proposals can be withdrawn.");
    }
    const now = new Date();
    if (proposal.expiresAt <= now) {
      await repository.update(proposalId, { status: "EXPIRED" }, tx);
      return { expired: true };
    }
    return serialize(
      await repository.update(
        proposalId,
        { status: "WITHDRAWN", withdrawnAt: now },
        tx,
      ),
    );
  });
  if (result.expired) throw new ApiError(409, "Proposal has expired.");
  return result;
};

const acceptProposal = async (userId, proposalId) => {
  try {
    const result = await repository.runTransaction(async (tx) => {
      const proposal = await repository.lockById(proposalId, tx);
      if (!proposal) throw new ApiError(404, "Proposal not found.");
      if (receiverIdFor(proposal) !== userId) {
        throw new ApiError(403, "Only the proposal receiver can accept it.");
      }
      if (proposal.status === "ACCEPTED") {
        return {
          proposal: serialize(proposal),
          assignment: proposal.assignment,
        };
      }
      if (proposal.status !== "PENDING")
        throw new ApiError(409, "Only pending proposals can be accepted.");
      if (proposal.expiresAt <= new Date()) {
        await repository.update(proposalId, { status: "EXPIRED" }, tx);
        return { expired: true };
      }

      const assignment = await assignmentService.createAssignmentInTransaction(
        proposal.trip.travelerId,
        {
          errandId: proposal.errandId,
          tripId: proposal.tripId,
          acceptanceSource: "PROPOSAL",
        },
        tx,
      );
      const now = new Date();
      const accepted = await repository.update(
        proposalId,
        {
          status: "ACCEPTED",
          acceptedAt: now,
          assignmentId: assignment.id,
          rejectionReason: null,
          rejectionNote: null,
          readAt: proposal.readAt || now,
        },
        tx,
      );
      await repository.rejectOtherPendingForErrand(
        proposal.errandId,
        proposalId,
        now,
        tx,
      );
      return { proposal: serialize(accepted), assignment };
    });
    if (result.expired) throw new ApiError(409, "Proposal has expired.");
    return result;
  } catch (error) {
    if (
      error?.code === "P2002" ||
      error?.message?.includes("one_active_assignment_per_errand")
    ) {
      throw new ApiError(409, "Errand already has an active assignment.");
    }
    throw error;
  }
};

const rejectProposal = async (userId, proposalId, rejectionNote) =>
  repository.runTransaction(async (tx) => {
    const proposal = await repository.lockById(proposalId, tx);
    if (!proposal) throw new ApiError(404, "Proposal not found.");
    if (receiverIdFor(proposal) !== userId) {
      throw new ApiError(403, "Only the proposal receiver can reject it.");
    }
    if (
      proposal.status === "REJECTED" &&
      proposal.rejectionReason === "REJECTED_BY_OWNER"
    ) {
      return serialize(proposal);
    }
    if (proposal.status !== "PENDING")
      throw new ApiError(409, "Only pending proposals can be rejected.");
    return serialize(
      await repository.update(
        proposalId,
        {
          status: "REJECTED",
          rejectionReason: "REJECTED_BY_OWNER",
          rejectionNote: rejectionNote?.trim() || null,
          rejectedAt: new Date(),
          readAt: proposal.readAt || new Date(),
        },
        tx,
      ),
    );
  });

module.exports = {
  createProposal,
  listErrandProposals,
  listTripProposals,
  listInbox,
  listSent,
  markProposalRead,
  withdrawProposal,
  acceptProposal,
  rejectProposal,
};
