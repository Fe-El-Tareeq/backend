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

module.exports = {
  findUserById,
  findActiveNeighborhoodById,
  updateUserProfile,
  updateProfileImage,
};
