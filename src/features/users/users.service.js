const ApiError = require("../../utils/ApiError");
const repository = require("./users.repository");
const profileImageStorage = require("./profileImage.storage");

const toPublicProfile = (user) => {
  const { profileImagePath, ...publicProfile } = user;
  return publicProfile;
};

// Returns the authenticated user's profile.
const getCurrentUserProfile = async (userId) => {
  const user = await repository.findUserById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  return toPublicProfile(user);
};

// Updates the authenticated user's profile.
const updateCurrentUserProfile = async (userId, payload) => {
  const user = await repository.findUserById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const updateData = {};

  // Update full name only when it is included in the request.
  if (payload.fullName !== undefined) {
    updateData.fullName = payload.fullName.trim();
  }

  // Validate the selected neighborhood before updating the user.
  if (payload.neighborhoodId !== undefined) {
    const neighborhood = await repository.findActiveNeighborhoodById(
      payload.neighborhoodId,
    );

    if (!neighborhood) {
      throw new ApiError(
        400,
        "Selected neighborhood does not exist or is inactive.",
      );
    }

    updateData.neighborhoodId = neighborhood.id;
  }

  // Determine the final profile values after applying the requested updates.
  const finalFullName =
    updateData.fullName !== undefined
      ? updateData.fullName
      : user.fullName;

  const finalNeighborhoodId =
    updateData.neighborhoodId !== undefined
      ? updateData.neighborhoodId
      : user.neighborhoodId;

  // A profile is complete when both the full name and neighborhood are set.
  updateData.profileCompleted = Boolean(
    finalFullName && finalNeighborhoodId,
  );

  return repository.updateUserProfile(userId, updateData);
};

const updateCurrentUserProfileImage = async (userId, image) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const uploaded = await profileImageStorage.upload(userId, image);
  let updatedUser;
  try {
    updatedUser = await repository.updateProfileImage(userId, uploaded.url, uploaded.path);
  } catch (error) {
    await profileImageStorage.remove(uploaded.path).catch(() => {});
    throw error;
  }

  if (user.profileImagePath) {
    await profileImageStorage.remove(user.profileImagePath).catch((error) => {
      console.error("Failed to remove replaced profile image:", error.message);
    });
  }
  return updatedUser;
};

const deleteCurrentUserProfileImage = async (userId) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  const updatedUser = await repository.updateProfileImage(userId, null, null);
  if (user.profileImagePath) {
    await profileImageStorage.remove(user.profileImagePath).catch((error) => {
      console.error("Failed to remove deleted profile image:", error.message);
    });
  }
  return updatedUser;
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  updateCurrentUserProfileImage,
  deleteCurrentUserProfileImage,
};
