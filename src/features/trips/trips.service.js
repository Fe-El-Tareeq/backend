const ApiError = require("../../utils/ApiError");

const repository = require("./trips.repository");
const deliveryPricingService = require("../deliveryPricing/deliveryPricing.service");

const {
  MIN_DEPARTURE_LEAD_MINUTES,
  MAX_DEPARTURE_DAYS,
} = require("./trips.constants");

// Normalizes optional strings before comparison/storage.
const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  return value.trim();
};

// Returns the expiration time for a trip.
// In Phase 6, a trip expires when its departure time is reached.
const calculateExpiresAt = (departureTime) => {
  return new Date(departureTime);
};

// Checks that the traveler can create trips.
const validateTravelerForPosting = (traveler) => {
  if (!traveler) {
    throw new ApiError(404, "Traveler not found.");
  }

  if (traveler.status !== "ACTIVE") {
    throw new ApiError(403, "User is not active.");
  }

  if (!traveler.phoneVerifiedAt) {
    throw new ApiError(
      403,
      "Phone number must be verified before creating a trip.",
    );
  }

  if (!traveler.profileCompleted) {
    throw new ApiError(
      400,
      "Profile must be completed before creating a trip.",
    );
  }

  if (!traveler.neighborhoodId || !traveler.neighborhood) {
    throw new ApiError(
      400,
      "A neighborhood must be selected before creating a trip.",
    );
  }

  if (!traveler.neighborhood.isActive) {
    throw new ApiError(400, "The selected neighborhood is not active.");
  }
};

// Compares a repeated create request with the existing trip.
const isSameCreateRequest = (trip, data) => {
  const existingDepartureTime = new Date(trip.departureTime).getTime();

  const requestedDepartureTime = new Date(data.departureTime).getTime();

  return (
    trip.originType === data.originType &&
    trip.destinationNeighborhoodId === data.destinationNeighborhoodId &&
    (data.originType !== "CUSTOM_KEYWORD" || trip.neighborhoodId === data.originNeighborhoodId) &&
    normalizeOptionalText(trip.customOriginKeyword) ===
      normalizeOptionalText(data.customOriginKeyword) &&
    trip.destinationKeyword.trim() === data.destinationKeyword.trim() &&
    existingDepartureTime === requestedDepartureTime &&
    trip.maxCapacityClass === data.maxCapacityClass &&
    trip.maxCapacityUnits === data.maxCapacityUnits &&
    normalizeOptionalText(trip.notes) === normalizeOptionalText(data.notes)
  );
};

// Creates a new trip.
// Creating a trip does NOT deduct tokens in Phase 6.
const createTrip = async (travelerId, data) => {
  return repository.runTransaction(async (tx) => {
    // Check idempotency first.
    const existingTrip = await repository.findByTravelerAndClientKey(
      travelerId,
      data.clientRequestKey,
      tx,
    );

    if (existingTrip) {
      if (!isSameCreateRequest(existingTrip, data)) {
        throw new ApiError(
          409,
          "Client request key has already been used with different trip data.",
        );
      }

      return existingTrip;
    }

    const traveler = await repository.findTravelerForPosting(travelerId, tx);

    validateTravelerForPosting(traveler);

    const originNeighborhoodId = data.originType === "CUSTOM_KEYWORD"
      ? data.originNeighborhoodId
      : traveler.neighborhoodId;

    const quote = await deliveryPricingService.quoteByNeighborhoodIds(
      originNeighborhoodId,
      data.destinationNeighborhoodId,
      tx,
    );

    const tripData = {
      travelerId,
      neighborhoodId: originNeighborhoodId,
      destinationNeighborhoodId: data.destinationNeighborhoodId,
      clientRequestKey: data.clientRequestKey,

      originType: data.originType,

      customOriginKeyword:
        data.originType === "CUSTOM_KEYWORD"
          ? data.customOriginKeyword.trim()
          : null,

      destinationKeyword: data.destinationKeyword.trim(),

      deliveryFeeNis: quote.deliveryFeeNis,
      pricingRule: quote.pricingRule,
      pricingVersion: quote.pricingVersion,

      departureTime: new Date(data.departureTime),

      maxCapacityClass: data.maxCapacityClass,

      maxCapacityUnits: data.maxCapacityUnits,

      // At creation, the full capacity is still available.
      remainingCapacityUnits: data.maxCapacityUnits,

      notes:
        data.notes === undefined || data.notes === null
          ? null
          : data.notes.trim(),

      status: "ACTIVE",

      expiresAt: calculateExpiresAt(data.departureTime),
    };

    return repository.createTrip(tripData, tx);
  });
};

// Returns a paginated list of trips.
const getTrips = async (userId, filters = {}) => {
  const {
    neighborhoodId,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine = false,
    skip = 0,
    take = 20,
  } = filters;

  const query = {
    userId,
    neighborhoodId,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine,
    skip,
    take,
  };

  const [trips, total] = await Promise.all([
    repository.listTrips(query),
    repository.countTrips(query),
  ]);

  return {
    trips,
    pagination: {
      skip,
      take,
      total,
    },
  };
};

// Returns one trip by ID.
const getTripById = async (tripId) => {
  const trip = await repository.findById(tripId);

  if (!trip) {
    throw new ApiError(404, "Trip not found.");
  }

  return trip;
};

// Verifies ownership and whether the trip can still be managed.
const validateTripForManagement = (trip, travelerId) => {
  if (!trip) {
    throw new ApiError(404, "Trip not found.");
  }

  if (trip.travelerId !== travelerId) {
    throw new ApiError(403, "You are not allowed to manage this trip.");
  }

  if (trip.status !== "ACTIVE") {
    throw new ApiError(400, "Only active trips can be modified.");
  }

  const now = new Date();

  if (trip.expiresAt <= now || trip.departureTime <= now) {
    throw new ApiError(400, "Expired trips cannot be modified.");
  }
};

// Updates an active trip owned by the traveler.
const updateTrip = async (travelerId, tripId, data) => {
  return repository.runTransaction(async (tx) => {
    const trip = await repository.findById(tripId, tx);

    validateTripForManagement(trip, travelerId);

    const updateData = {};

    if (data.departureTime !== undefined) {
      updateData.departureTime = new Date(data.departureTime);

      updateData.expiresAt = calculateExpiresAt(data.departureTime);
    }

    if (data.maxCapacityClass !== undefined) {
      updateData.maxCapacityClass = data.maxCapacityClass;
    }

    if (data.maxCapacityUnits !== undefined) {
      const usedCapacity = trip.maxCapacityUnits - trip.remainingCapacityUnits;

      if (data.maxCapacityUnits < usedCapacity) {
        throw new ApiError(
          400,
          "Maximum capacity cannot be lower than the already used capacity.",
        );
      }

      updateData.maxCapacityUnits = data.maxCapacityUnits;

      updateData.remainingCapacityUnits = data.maxCapacityUnits - usedCapacity;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes === null ? null : data.notes.trim();
    }

    return repository.updateTrip(tripId, updateData, tx);
  });
};

// Cancels an active trip.
// No token refund is performed because trip creation does not deduct tokens.
const cancelTrip = async (travelerId, tripId) => {
  return repository.runTransaction(async (tx) => {
    const trip = await repository.findById(tripId, tx);

    if (!trip) {
      throw new ApiError(404, "Trip not found.");
    }

    if (trip.travelerId !== travelerId) {
      throw new ApiError(403, "You are not allowed to cancel this trip.");
    }

    if (trip.status !== "ACTIVE") {
      throw new ApiError(400, "Only active trips can be cancelled.");
    }

    const now = new Date();

    if (trip.expiresAt <= now || trip.departureTime <= now) {
      throw new ApiError(400, "Expired trips cannot be cancelled.");
    }

    return repository.updateTrip(
      tripId,
      {
        status: "CANCELLED",
      },
      tx,
    );
  });
};

module.exports = {
  calculateExpiresAt,
  validateTravelerForPosting,
  isSameCreateRequest,
  createTrip,
  getTrips,
  getTripById,
  updateTrip,
  cancelTrip,
};
