const ApiResponse = require("../../utils/ApiResponse");
const service = require("./ratings.service");
const createRating = async (req, res, next) => {
  try {
    const result = await service.createRating(
      req.user.id,
      req.validatedData.body,
    );
    const status = result.created ? 201 : 200;
    return res
      .status(status)
      .json(
        new ApiResponse(
          status,
          result.created
            ? "Rating submitted successfully."
            : "Rating already submitted.",
          result,
        ),
      );
  } catch (error) {
    return next(error);
  }
};
const getPending = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Pending ratings retrieved successfully.",
          await service.getPending(req.user.id, req.validatedData.query),
        ),
      );
  } catch (error) {
    return next(error);
  }
};
const getReceived = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Received ratings retrieved successfully.",
          await service.getReceived(req.user.id, req.validatedData.query),
        ),
      );
  } catch (error) {
    return next(error);
  }
};
const getSummary = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Rating summary retrieved successfully.",
          await service.getSummary(req.user.id),
        ),
      );
  } catch (error) {
    return next(error);
  }
};
const getAssignmentRatings = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Assignment ratings retrieved successfully.",
          await service.getAssignmentRatings(
            req.user.id,
            req.validatedData.params.assignmentId,
          ),
        ),
      );
  } catch (error) {
    return next(error);
  }
};
module.exports = {
  createRating,
  getPending,
  getReceived,
  getSummary,
  getAssignmentRatings,
};
