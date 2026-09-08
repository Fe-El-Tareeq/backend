const prisma = require("../../config/prisma");

const areaSelect = { id: true, key: true, name: true, governorate: true };
const userSelect = {
  id: true,
  fullName: true,
  trustScore: true,
  profileImageUrl: true,
  _count: { select: { assignments: { where: { status: "COMPLETED" } } } },
};
const proposalInclude = {
  assignment: { include: { chatRoom: true } },
  initiatedBy: { select: userSelect },
  errand: {
    include: {
      requester: { select: userSelect },
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
    },
  },
  trip: {
    include: {
      traveler: { select: userSelect },
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
    },
  },
};

const runTransaction = (callback) => prisma.$transaction(callback);
const findErrand = (id, client = prisma) =>
  client.errand.findUnique({
    where: { id },
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
    },
  });
const findTrip = (id, client = prisma) =>
  client.trip.findUnique({
    where: { id },
    include: {
      neighborhood: { select: areaSelect },
      destinationNeighborhood: { select: areaSelect },
    },
  });
const findByInitiatorAndKey = (
  initiatedById,
  clientRequestKey,
  client = prisma,
) =>
  client.proposal.findUnique({
    where: {
      initiatedById_clientRequestKey: { initiatedById, clientRequestKey },
    },
    include: proposalInclude,
  });
const create = (data, client = prisma) =>
  client.proposal.create({ data, include: proposalInclude });
const expirePending = (where, now, client = prisma) =>
  client.proposal.updateMany({
    where: { ...where, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
const list = ({ where, skip, take }, client = prisma) =>
  client.proposal.findMany({
    where,
    include: proposalInclude,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
const count = (where, client = prisma) => client.proposal.count({ where });
const countByStatus = async (where, client = prisma) => {
  const rows = await client.proposal.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  return rows;
};
const lockById = async (id, client) => {
  await client.$queryRaw`SELECT id FROM proposals WHERE id = ${id}::uuid FOR UPDATE`;
  return client.proposal.findUnique({
    where: { id },
    include: proposalInclude,
  });
};
const update = (id, data, client = prisma) =>
  client.proposal.update({
    where: { id },
    data,
    include: proposalInclude,
  });
const rejectOtherPendingForErrand = (
  errandId,
  acceptedProposalId,
  now,
  client = prisma,
) =>
  client.proposal.updateMany({
    where: { errandId, id: { not: acceptedProposalId }, status: "PENDING" },
    data: {
      status: "REJECTED",
      rejectionReason: "ANOTHER_PROPOSAL_ACCEPTED",
      rejectedAt: now,
    },
  });

module.exports = {
  runTransaction,
  findErrand,
  findTrip,
  findByInitiatorAndKey,
  create,
  expirePending,
  list,
  count,
  countByStatus,
  lockById,
  update,
  rejectOtherPendingForErrand,
};
