const ApiResponse = require("../../utils/ApiResponse");
const s = require("./reports.service");
const create = async (req, res, next) => {
  try {
    const x = await s.create(req.user, req.validatedData.body);
    res
      .status(x.created ? 201 : 200)
      .json(
        new ApiResponse(
          x.created ? 201 : 200,
          x.created
            ? "Report submitted successfully."
            : "Existing report retrieved successfully.",
          x,
        ),
      );
  } catch (e) {
    next(e);
  }
};
const listMine = async (req, res, next) => {
  try {
    res.json(
      new ApiResponse(
        200,
        "Reports retrieved successfully.",
        await s.listMine(req.user, req.validatedData.query),
      ),
    );
  } catch (e) {
    next(e);
  }
};
const get = async (req, res, next) => {
  try {
    res.json(
      new ApiResponse(
        200,
        "Report retrieved successfully.",
        await s.get(req.user, req.validatedData.params.id),
      ),
    );
  } catch (e) {
    next(e);
  }
};
const listAdmin = async (req, res, next) => {
  try {
    res.json(
      new ApiResponse(
        200,
        "Reports retrieved successfully.",
        await s.listAdmin(req.user, req.validatedData.query),
      ),
    );
  } catch (e) {
    next(e);
  }
};
const update = async (req, res, next) => {
  try {
    res.json(
      new ApiResponse(
        200,
        "Report updated successfully.",
        await s.update(
          req.user,
          req.validatedData.params.id,
          req.validatedData.body,
        ),
      ),
    );
  } catch (e) {
    next(e);
  }
};
module.exports = { create, listMine, get, listAdmin, update };
