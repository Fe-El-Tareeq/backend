const ApiResponse = require("../../utils/ApiResponse");
const service = require("./admin.service");

const listVerifications = async (req, res, next) => {
  try {
    const result = await service.listVerifications(req.validatedData.query);
    return res.status(200).json(new ApiResponse(200, "Identity verifications retrieved successfully.", result));
  } catch (error) { return next(error); }
};
const getVerification = async (req, res, next) => {
  try {
    const verification = await service.getVerification(req.validatedData.params.id);
    return res.status(200).json(new ApiResponse(200, "Identity verification retrieved successfully.", { verification }));
  } catch (error) { return next(error); }
};
const approveVerification = async (req, res, next) => {
  try {
    const verification = await service.approveVerification(req.user.id, req.validatedData.params.id);
    return res.status(200).json(new ApiResponse(200, "Identity verification approved successfully.", { verification }));
  } catch (error) { return next(error); }
};
const rejectVerification = async (req, res, next) => {
  try {
    const verification = await service.rejectVerification(req.user.id, req.validatedData.params.id, req.validatedData.body.reason);
    return res.status(200).json(new ApiResponse(200, "Identity verification rejected successfully.", { verification }));
  } catch (error) { return next(error); }
};

module.exports = { listVerifications, getVerification, approveVerification, rejectVerification };
