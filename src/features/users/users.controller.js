const ApiResponse = require("../../utils/ApiResponse");
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

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
};
