const ApiResponse = require("../../utils/ApiResponse");
const service = require("./proposals.service");

const createProposal = async (req, res, next) => {
  try {
    const result = await service.createProposal(
      req.user.id,
      req.validatedData.body,
    );
    return res
      .status(result.created ? 201 : 200)
      .json(
        new ApiResponse(
          result.created ? 201 : 200,
          result.created
            ? "Proposal created successfully."
            : "Existing proposal retrieved successfully.",
          result,
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const listErrandProposals = async (req, res, next) => {
  try {
    const result = await service.listErrandProposals(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.query,
    );
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Errand proposals retrieved successfully.",
          result,
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const listTripProposals = async (req, res, next) => {
  try {
    const result = await service.listTripProposals(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.query,
    );
    return res
      .status(200)
      .json(
        new ApiResponse(200, "Trip proposals retrieved successfully.", result),
      );
  } catch (error) {
    return next(error);
  }
};

const acceptProposal = async (req, res, next) => {
  try {
    const result = await service.acceptProposal(
      req.user.id,
      req.validatedData.params.id,
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "Proposal accepted successfully.", result));
  } catch (error) {
    return next(error);
  }
};

const rejectProposal = async (req, res, next) => {
  try {
    const proposal = await service.rejectProposal(
      req.user.id,
      req.validatedData.params.id,
    );
    return res
      .status(200)
      .json(
        new ApiResponse(200, "Proposal rejected successfully.", { proposal }),
      );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProposal,
  listErrandProposals,
  listTripProposals,
  acceptProposal,
  rejectProposal,
};
