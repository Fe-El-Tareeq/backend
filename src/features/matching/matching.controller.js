const ApiResponse = require("../../utils/ApiResponse");
const service = require("./matching.service");

const getTripsForErrand = async (req, res, next) => {
  try {
    const data = await service.getTripsForErrand(req.user.id, req.validatedData.params.id, req.validatedData.query.limit);
    return res.status(200).json(new ApiResponse(200, "Matching trips retrieved successfully.", data));
  } catch (error) { return next(error); }
};
const getErrandsForTrip = async (req, res, next) => {
  try {
    const data = await service.getErrandsForTrip(req.user.id, req.validatedData.params.id, req.validatedData.query.limit);
    return res.status(200).json(new ApiResponse(200, "Matching errands retrieved successfully.", data));
  } catch (error) { return next(error); }
};

module.exports = { getTripsForErrand, getErrandsForTrip };
