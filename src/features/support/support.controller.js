const ApiResponse = require("../../utils/ApiResponse");
const service = require("./support.service");
const config = async (req, res, next) => {
  try {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Support configuration retrieved successfully.",
          service.config(),
        ),
      );
  } catch (e) {
    next(e);
  }
};
const create = async (req, res, next) => {
  try {
    const result = await service.create(req.user, req.validatedData.body);
    res
      .status(result.created ? 201 : 200)
      .json(
        new ApiResponse(
          result.created ? 201 : 200,
          result.created
            ? "Support ticket created successfully."
            : "Existing support ticket retrieved successfully.",
          result,
        ),
      );
  } catch (e) {
    next(e);
  }
};
const listMine = async (req, res, next) => {
  try {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Support tickets retrieved successfully.",
          await service.listMine(req.user, req.validatedData.query),
        ),
      );
  } catch (e) {
    next(e);
  }
};
const get = async (req, res, next) => {
  try {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Support ticket retrieved successfully.",
          await service.get(req.user, req.validatedData.params.id),
        ),
      );
  } catch (e) {
    next(e);
  }
};
const sendMessage = async (req, res, next) => {
  try {
    const result = await service.sendMessage(
      req.user,
      req.validatedData.params.id,
      req.validatedData.body,
    );
    res
      .status(result.created ? 201 : 200)
      .json(
        new ApiResponse(
          result.created ? 201 : 200,
          "Support message processed successfully.",
          result,
        ),
      );
  } catch (e) {
    next(e);
  }
};
const listAdmin = async (req, res, next) => {
  try {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Support tickets retrieved successfully.",
          await service.listAdmin(req.user, req.validatedData.query),
        ),
      );
  } catch (e) {
    next(e);
  }
};
const updateStatus = async (req, res, next) => {
  try {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Support ticket status updated successfully.",
          await service.updateStatus(
            req.user,
            req.validatedData.params.id,
            req.validatedData.body.status,
          ),
        ),
      );
  } catch (e) {
    next(e);
  }
};
module.exports = {
  config,
  create,
  listMine,
  get,
  sendMessage,
  listAdmin,
  updateStatus,
};
