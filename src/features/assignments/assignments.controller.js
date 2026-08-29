const ApiResponse = require("../../utils/ApiResponse");
const service = require("./assignments.service");

const createAssignment = async (req, res, next) => {
  try {
    const assignment = await service.createAssignment(req.user.id, req.validatedData.body);
    return res
      .status(201)
      .json(new ApiResponse(201, "Assignment accepted successfully.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

const listAssignments = async (req, res, next) => {
  try {
    const result = await service.listAssignments(req.user.id, req.validatedData.query);
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignments retrieved successfully.", result));
  } catch (error) {
    return next(error);
  }
};

const getAssignmentById = async (req, res, next) => {
  try {
    const assignment = await service.getAssignmentById(req.user.id, req.validatedData.params.id);
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignment retrieved successfully.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

const markPickedUp = async (req, res, next) => {
  try {
    const assignment = await service.markPickedUp(req.user.id, req.validatedData.params.id);
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignment marked as picked up.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

const startDelivery = async (req, res, next) => {
  try {
    const assignment = await service.startDelivery(req.user.id, req.validatedData.params.id);
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignment delivery started.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

const completeAssignment = async (req, res, next) => {
  try {
    const assignment = await service.completeAssignment(req.user.id, req.validatedData.params.id);
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignment completed successfully.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

const cancelAssignment = async (req, res, next) => {
  try {
    const assignment = await service.cancelAssignment(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.body || {},
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "Assignment cancelled successfully.", { assignment }));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createAssignment,
  listAssignments,
  getAssignmentById,
  markPickedUp,
  startDelivery,
  completeAssignment,
  cancelAssignment,
};
