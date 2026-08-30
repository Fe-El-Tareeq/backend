const prisma = require("../../config/prisma");
const { ACTIVE_ASSIGNMENT_STATUSES } = require("./assignments.constants");

const areaSelect = { id: true, key: true, name: true, governorate: true };
const safeUserSelect = { id: true, fullName: true, trustScore: true, profileImageUrl: true };

const assignmentInclude = {
  errand: {
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
      requester: { select: safeUserSelect },
    },
  },
  trip: {
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
      traveler: { select: safeUserSelect },
    },
  },
  traveler: { select: safeUserSelect },
  cancelledBy: { select: safeUserSelect },
  chatRoom: {
    select: {
      id: true,
      assignmentId: true,
      createdAt: true,
      updatedAt: true,
      lastMessageAt: true,
    },
  },
};

const runTransaction = (callback) => prisma.$transaction(callback);

const lockErrand = async (errandId, client) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM errands
    WHERE id = ${errandId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
};

const lockTrip = async (tripId, client) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM trips
    WHERE id = ${tripId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
};

const lockAssignment = async (assignmentId, client) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM errand_assignments
    WHERE id = ${assignmentId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
};

const findErrandForAccept = async (errandId, client = prisma) => {
  await lockErrand(errandId, client);
  return client.errand.findUnique({
    where: { id: errandId },
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
      requester: { select: safeUserSelect },
    },
  });
};

const findTripForAccept = async (tripId, client = prisma) => {
  await lockTrip(tripId, client);
  return client.trip.findUnique({
    where: { id: tripId },
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
      traveler: { select: safeUserSelect },
    },
  });
};

const findActiveAssignmentForErrand = async (errandId, client = prisma) => {
  return client.errandAssignment.findFirst({
    where: {
      errandId,
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
    },
    include: assignmentInclude,
  });
};

const createAssignment = async (data, client = prisma) => {
  return client.errandAssignment.create({
    data,
    include: assignmentInclude,
  });
};

const createChatRoom = async (assignmentId, client = prisma) => {
  return client.chatRoom.create({
    data: { assignmentId },
  });
};

const updateErrandStatus = async (errandId, status, client = prisma) => {
  return client.errand.update({
    where: { id: errandId },
    data: { status },
  });
};

const updateTripCapacity = async (tripId, remainingCapacityUnits, client = prisma) => {
  return client.trip.update({
    where: { id: tripId },
    data: { remainingCapacityUnits },
  });
};

const restoreTripCapacity = async (tripId, capacityUnits, client = prisma) => {
  return client.trip.update({
    where: { id: tripId },
    data: { remainingCapacityUnits: { increment: capacityUnits } },
  });
};

const markMatchAcceptedIfPresent = async ({ errandId, tripId, acceptedAt }, client = prisma) => {
  return client.match.updateMany({
    where: { errandId, tripId, status: "SUGGESTED" },
    data: { status: "ACCEPTED", acceptedAt },
  });
};

const findAssignmentById = async (assignmentId, client = prisma) => {
  return client.errandAssignment.findUnique({
    where: { id: assignmentId },
    include: assignmentInclude,
  });
};

const findAssignmentByIdForUpdate = async (assignmentId, client = prisma) => {
  await lockAssignment(assignmentId, client);
  return findAssignmentById(assignmentId, client);
};

const updateAssignment = async (assignmentId, data, client = prisma) => {
  return client.errandAssignment.update({
    where: { id: assignmentId },
    data,
    include: assignmentInclude,
  });
};

const listAssignmentsForUser = async ({ userId, skip, take }, client = prisma) => {
  return client.errandAssignment.findMany({
    where: {
      OR: [
        { travelerId: userId },
        { errand: { requesterId: userId } },
      ],
    },
    include: assignmentInclude,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
};

const countAssignmentsForUser = async (userId, client = prisma) => {
  return client.errandAssignment.count({
    where: {
      OR: [
        { travelerId: userId },
        { errand: { requesterId: userId } },
      ],
    },
  });
};

module.exports = {
  runTransaction,
  lockTrip,
  findErrandForAccept,
  findTripForAccept,
  findActiveAssignmentForErrand,
  createAssignment,
  createChatRoom,
  updateErrandStatus,
  updateTripCapacity,
  restoreTripCapacity,
  markMatchAcceptedIfPresent,
  findAssignmentById,
  findAssignmentByIdForUpdate,
  updateAssignment,
  listAssignmentsForUser,
  countAssignmentsForUser,
};
