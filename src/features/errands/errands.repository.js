const prisma = require("../../config/prisma");

const errandSelect = {
  id: true,
  requesterId: true,
  categoryId: true,
  neighborhoodId: true,
  destinationNeighborhoodId: true,
  clientRequestKey: true,
  title: true,
  itemsDescription: true,
  destinationKeyword: true,
  weightClass: true,
  isUrgent: true,
  isInterZone: true,
  priorityScore: true,
  calculatedFeeNis: true,
  postTokenCost: true,
  postTokenTransactionId: true,
  voiceNoteUrl: true,
  voiceNoteDurationSec: true,
  status: true,
  neededByTime: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      priorityWeight: true,
      icon: true,
    },
  },
  neighborhood: {
    select: {
      id: true,
      name: true,
      governorate: true,
    },
  },
  destinationNeighborhood: {
    select: {
      id: true,
      key: true,
      name: true,
      governorate: true,
    },
  },
  requester: {
    select: {
      id: true,
      fullName: true,
      trustScore: true,
    },
  },
};

const runTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

const findRequesterForPosting = async (userId, client = prisma) => {
  return client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      neighborhoodId: true,
      profileCompleted: true,
      phoneVerifiedAt: true,
      status: true,
    },
  });
};

const findActiveCategoryById = async (categoryId, client = prisma) => {
  return client.category.findFirst({
    where: {
      id: categoryId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      priorityWeight: true,
      icon: true,
    },
  });
};

const findActiveNeighborhoodById = async (neighborhoodId, client = prisma) => {
  return client.neighborhood.findFirst({
    where: { id: neighborhoodId, isActive: true, key: { not: null } },
    select: { id: true, key: true, name: true, governorate: true },
  });
};

const findByRequesterAndClientKey = async (
  requesterId,
  clientRequestKey,
  client = prisma,
) => {
  return client.errand.findUnique({
    where: {
      requesterId_clientRequestKey: {
        requesterId,
        clientRequestKey,
      },
    },
    select: errandSelect,
  });
};

const createErrand = async (data, client = prisma) => {
  return client.errand.create({
    data,
    select: errandSelect,
  });
};

const findById = async (id, client = prisma) => {
  return client.errand.findUnique({
    where: { id },
    select: errandSelect,
  });
};

const listErrands = async ({ where, skip, take }, client = prisma) => {
  return client.errand.findMany({
    where,
    select: errandSelect,
    skip,
    take,
    orderBy: [
      { priorityScore: "desc" },
      { isUrgent: "desc" },
      { createdAt: "desc" },
    ],
  });
};

const countErrands = async (where, client = prisma) => {
  return client.errand.count({ where });
};

const updateErrand = async (id, data, client = prisma) => {
  return client.errand.update({
    where: { id },
    data,
    select: errandSelect,
  });
};

module.exports = {
  runTransaction,
  findRequesterForPosting,
  findActiveCategoryById,
  findActiveNeighborhoodById,
  findByRequesterAndClientKey,
  createErrand,
  findById,
  listErrands,
  countErrands,
  updateErrand,
};
