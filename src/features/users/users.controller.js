const ApiResponse = require("../../utils/ApiResponse");
const ApiError = require("../../utils/ApiError");
const service = require("./users.service");

// Returns the authenticated user's profile.
const getCurrentUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await service.getCurrentUserProfile(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, "User profile retrieved successfully.", user));
  } catch (error) {
    next(error);
  }
};

// Updates the authenticated user's profile.
const updateCurrentUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Uses the validated request body produced by the validation middleware.
    const payload = req.validatedData.body;

    const user = await service.updateCurrentUserProfile(userId, payload);

    return res
      .status(200)
      .json(new ApiResponse(200, "User profile updated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const updateCurrentUserProfileImage = async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "Profile image is required.");
    const user = await service.updateCurrentUserProfileImage(req.user.id, req.file);
    return res.status(200).json(
      new ApiResponse(200, "Profile image updated successfully.", user),
    );
  } catch (error) {
    next(error);
  }
};

const deleteCurrentUserProfileImage = async (req, res, next) => {
  try {
    const user = await service.deleteCurrentUserProfileImage(req.user.id);
    return res.status(200).json(
      new ApiResponse(200, "Profile image deleted successfully.", user),
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  updateCurrentUserProfileImage,
  deleteCurrentUserProfileImage,
};
