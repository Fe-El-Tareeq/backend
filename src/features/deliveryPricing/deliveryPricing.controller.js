const ApiResponse = require("../../utils/ApiResponse");
const ApiError = require("../../utils/ApiError");
const usersRepository = require("../users/users.repository");
const service = require("./deliveryPricing.service");

const getQuote = async (req, res, next) => {
  try {
    const currentUser = await usersRepository.findUserById(req.user.id);
    const originNeighborhoodId = req.validatedData.query.originNeighborhoodId || currentUser?.neighborhoodId;
    if (!originNeighborhoodId) throw new ApiError(400, "An origin neighborhood is required for pricing.");
    const quote = await service.quoteByNeighborhoodIds(originNeighborhoodId, req.validatedData.query.destinationNeighborhoodId);
    return res.status(200).json(new ApiResponse(200, "Delivery price calculated successfully.", quote));
  } catch (error) { next(error); }
};

module.exports = { getQuote };
