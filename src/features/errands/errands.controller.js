const ApiResponse = require("../../utils/ApiResponse");
const service = require("./errands.service");

const createErrand = async (req, res, next) => {
  try {
    const errand = await service.createErrand(req.user.id, req.validatedData.body);

    return res
      .status(201)
      .json(new ApiResponse(201, "Errand created successfully", { errand }));
  } catch (error) {
    next(error);
  }
};

const listErrands = async (req, res, next) => {
  try {
    const result = await service.listErrands(req.user, req.validatedData.query);

    return res
      .status(200)
      .json(new ApiResponse(200, "Errands retrieved successfully", result));
  } catch (error) {
    next(error);
  }
};

const getErrandById = async (req, res, next) => {
  try {
    const errand = await service.getErrandById(req.validatedData.params.id);

    return res
      .status(200)
      .json(new ApiResponse(200, "Errand retrieved successfully", { errand }));
  } catch (error) {
    next(error);
  }
};

const updateErrand = async (req, res, next) => {
  try {
    const errand = await service.updateErrand(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.body,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, "Errand updated successfully", { errand }));
  } catch (error) {
    next(error);
  }
};

const cancelErrand = async (req, res, next) => {
  try {
    const errand = await service.cancelErrand(
      req.user.id,
      req.validatedData.params.id,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, "Errand cancelled successfully", { errand }));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createErrand,
  listErrands,
  getErrandById,
  updateErrand,
  cancelErrand,
};
