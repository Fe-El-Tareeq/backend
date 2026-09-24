const ApiError = require("../../utils/ApiError");
const bcrypt = require("bcryptjs");
const repository = require("./users.repository");
const profileImageStorage = require("./profileImage.storage");
const env = require("../../config/env");
const identityStorage = require("./identityVerification.storage");
const { findCityByGovernorate } = require("../locations/locations.catalog");

const toPublicProfile = (user) => {
  const { profileImagePath, ...publicProfile } = user;
  return publicProfile;
};

// Returns the authenticated user's profile.
const getCurrentUserProfile = async (userId) => {
  const [user, statistics] = await Promise.all([
    repository.findUserById(userId),
    repository.getProfileStatistics(userId),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const publicProfile = toPublicProfile(user);
  const verification = publicProfile.identityVerifications?.[0] || null;
  delete publicProfile.identityVerifications;
  const city = publicProfile.neighborhood
    ? findCityByGovernorate(publicProfile.neighborhood.governorate)
    : null;
  return {
    ...publicProfile,
    city: city
      ? { key: city.key, nameAr: city.nameAr, nameEn: city.nameEn }
      : null,
    isVerified: publicProfile.verificationStatus === "VERIFIED",
    verification,
    statistics,
  };
};

const submitIdentityVerification = async (userId, files) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  if (user.verificationStatus === "VERIFIED") {
    throw new ApiError(409, "Identity is already verified.");
  }
  if (await repository.findPendingIdentityVerification(userId)) {
    throw new ApiError(
      409,
      "An identity verification request is already pending review.",
    );
  }

  const uploadedPaths = [];
  try {
    const uploads = await Promise.allSettled([
        identityStorage.upload(userId, "front", files.idFrontImage[0]),
        identityStorage.upload(userId, "back", files.idBackImage[0]),
        identityStorage.upload(userId, "selfie", files.selfieImage[0]),
      ]);
    uploadedPaths.push(
      ...uploads
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value),
    );
    const failedUpload = uploads.find((result) => result.status === "rejected");
    if (failedUpload) throw failedUpload.reason;
    const [idFrontImagePath, idBackImagePath, selfieImagePath] = uploads.map(
      (result) => result.value,
    );
    const result = await repository.submitIdentityVerification(userId, {
      idFrontImagePath,
      idBackImagePath,
      selfieImagePath,
    });
    if (result.conflict) {
      throw new ApiError(
        409,
        "An identity verification request is already pending review.",
      );
    }
    return result.verification;
  } catch (error) {
    await Promise.allSettled(
      uploadedPaths.map((path) => identityStorage.remove(path)),
    );
    throw error;
  }
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
    updateData.fullName !== undefined ? updateData.fullName : user.fullName;

  const finalNeighborhoodId =
    updateData.neighborhoodId !== undefined
      ? updateData.neighborhoodId
      : user.neighborhoodId;

  // A profile is complete when both the full name and neighborhood are set.
  updateData.profileCompleted = Boolean(finalFullName && finalNeighborhoodId);

  return repository.updateUserProfile(userId, updateData);
};

const updateCurrentUserProfileImage = async (userId, image) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const uploaded = await profileImageStorage.upload(userId, image);
  let updatedUser;
  try {
    updatedUser = await repository.updateProfileImage(
      userId,
      uploaded.url,
      uploaded.path,
    );
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

const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  newTripsEnabled: true,
  chatMessagesEnabled: true,
  requestUpdatesEnabled: true,
});

const getCurrentUserSettings = async (userId) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const preference = await repository.findNotificationPreference(userId);
  return {
    notifications: preference
      ? {
          newTripsEnabled: preference.newTripsEnabled,
          chatMessagesEnabled: preference.chatMessagesEnabled,
          requestUpdatesEnabled: preference.requestUpdatesEnabled,
        }
      : { ...DEFAULT_NOTIFICATION_SETTINGS },
  };
};

const updateCurrentUserNotificationSettings = async (userId, payload) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const preference = await repository.upsertNotificationPreference(
    userId,
    payload,
  );
  return {
    notifications: {
      newTripsEnabled: preference.newTripsEnabled,
      chatMessagesEnabled: preference.chatMessagesEnabled,
      requestUpdatesEnabled: preference.requestUpdatesEnabled,
    },
  };
};

const deactivateCurrentUserAccount = async (userId, { password }) =>
  repository.runTransaction(async (tx) => {
    const user = await repository.findCredentials(userId, tx);
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new ApiError(401, "Current password is incorrect.");
    }
    const blockers = await repository.accountDeletionBlockers(userId, tx);
    if (Object.values(blockers).some((count) => count > 0)) {
      throw new ApiError(
        409,
        "Account cannot be deactivated while active operations exist.",
      );
    }
    await repository.revokeSessions(userId, tx);
    const requestedAt = new Date();
    const scheduledAt = new Date(
      requestedAt.getTime() + env.accountDeletionRetentionDays * 86400000,
    );
    return repository.deactivateAccount(userId, requestedAt, scheduledAt, tx);
  });

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  updateCurrentUserProfileImage,
  deleteCurrentUserProfileImage,
  getCurrentUserSettings,
  updateCurrentUserNotificationSettings,
  deactivateCurrentUserAccount,
  submitIdentityVerification,
};
