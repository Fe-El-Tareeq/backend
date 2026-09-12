const { createRepository } = require("../../utils/featureScaffold");
const { FEATURE_NAME } = require("./users.constants");

module.exports = createRepository(FEATURE_NAME);
const prisma = require("../../config/prisma");

// Returns the current user's profile information.
const findUserById = async (userId) => {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      phone: true,
      fullName: true,
      profileImageUrl: true,
      profileImagePath: true,
      role: true,
      trustScore: true,
      neighborhoodId: true,
      profileCompleted: true,
      phoneVerifiedAt: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
          isActive: true,
        },
      },
    },
  });
};

// Finds a neighborhood only when it exists and is active.
const findActiveNeighborhoodById = async (neighborhoodId) => {
  return prisma.neighborhood.findFirst({
    where: {
      id: neighborhoodId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      governorate: true,
      isActive: true,
    },
  });
};

// Updates the current user's profile.
const updateUserProfile = async (userId, data) => {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data,
    select: {
      id: true,
      phone: true,
      fullName: true,
      profileImageUrl: true,
      role: true,
      trustScore: true,
      neighborhoodId: true,
      profileCompleted: true,
      status: true,
      updatedAt: true,
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
          isActive: true,
        },
      },
    },
  });
};

const updateProfileImage = async (userId, profileImageUrl, profileImagePath) =>
  updateUserProfile(userId, { profileImageUrl, profileImagePath });

const findNotificationPreference = (userId) =>
  prisma.userNotificationPreference.findUnique({ where: { userId } });

const upsertNotificationPreference = (userId, data) =>
  prisma.userNotificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

const runTransaction = (callback) => prisma.$transaction(callback);
const findCredentials = (userId, client = prisma) =>
  client.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, status: true },
  });
const accountDeletionBlockers = async (userId, client = prisma) => {
  const [assignments, errands, trips] = await Promise.all([
    client.errandAssignment.count({
      where: {
        status: { in: ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"] },
        OR: [{ travelerId: userId }, { errand: { requesterId: userId } }],
      },
    }),
    client.errand.count({
      where: { requesterId: userId, status: { in: ["OPEN", "MATCHED"] } },
    }),
    client.trip.count({ where: { travelerId: userId, status: "ACTIVE" } }),
  ]);
  return { assignments, errands, trips };
};
const deactivateAccount = (userId, requestedAt, scheduledAt, client = prisma) =>
  client.user.update({
    where: { id: userId },
    data: {
      status: "DEACTIVATED",
      deletionRequestedAt: requestedAt,
      deletionScheduledAt: scheduledAt,
    },
    select: {
      id: true,
      status: true,
      deletionRequestedAt: true,
      deletionScheduledAt: true,
      updatedAt: true,
    },
  });
const revokeSessions = (userId, client = prisma) =>
  client.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

module.exports = {
  findUserById,
  findActiveNeighborhoodById,
  updateUserProfile,
  updateProfileImage,
  findNotificationPreference,
  upsertNotificationPreference,
  runTransaction,
  findCredentials,
  accountDeletionBlockers,
  deactivateAccount,
  revokeSessions,
};
