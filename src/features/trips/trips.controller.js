const ApiResponse = require("../../utils/ApiResponse");
const service = require("./trips.service");

// Creates a new trip for the authenticated traveler.
const createTrip = async (req, res, next) => {
  try {
    const travelerId = req.user.id;
    const data = req.validatedData.body;

    const trip = await service.createTrip(travelerId, data);

    return res
      .status(201)
      .json(new ApiResponse(201, "Trip created successfully.", trip));
  } catch (error) {
    next(error);
  }
};

// Returns a paginated list of trips.
const getTrips = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const filters = req.validatedData.query;

    const result = await service.getTrips(userId, filters);

    return res
      .status(200)
      .json(new ApiResponse(200, "Trips retrieved successfully.", result));
  } catch (error) {
    next(error);
  }
};

// Returns details for a single trip.
const getTripById = async (req, res, next) => {
  try {
    const { id } = req.validatedData.params;

    const trip = await service.getTripById(id);

    return res
      .status(200)
      .json(new ApiResponse(200, "Trip retrieved successfully.", trip));
  } catch (error) {
    next(error);
  }
};

// Updates an active trip owned by the authenticated traveler.
const updateTrip = async (req, res, next) => {
  try {
    const travelerId = req.user.id;
    const { id } = req.validatedData.params;
    const data = req.validatedData.body;

    const trip = await service.updateTrip(travelerId, id, data);

    return res
      .status(200)
      .json(new ApiResponse(200, "Trip updated successfully.", trip));
  } catch (error) {
    next(error);
  }
};

// Cancels an active trip owned by the authenticated traveler.
const cancelTrip = async (req, res, next) => {
  try {
    const travelerId = req.user.id;
    const { id } = req.validatedData.params;

    const trip = await service.cancelTrip(travelerId, id);

    return res
      .status(200)
      .json(new ApiResponse(200, "Trip cancelled successfully.", trip));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTrip,
  getTrips,
  getTripById,
  updateTrip,
  cancelTrip,
};
