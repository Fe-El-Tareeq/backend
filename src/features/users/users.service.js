const ApiError = require("../../utils/ApiError");
const repository = require("./users.repository");

// Returns the authenticated user's profile.
const getCurrentUserProfile = async (userId) => {
  const user = await repository.findUserById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  return user;
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

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
};