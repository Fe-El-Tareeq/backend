const ApiError = require("../../utils/ApiError");
const { areaByKey } = require("../deliveryPricing/deliveryPricing.config");
const repository = require("./matching.repository");
const { WEIGHT_CLASS_UNITS, SCORE_WEIGHTS, TRUST_BASELINE, TIME_SCORE_WINDOW_HOURS } = require("./matching.constants");

const compatibleAreaKeys = (key) => {
  const area = areaByKey.get(key);
  if (!area) return [];
  const reverseNearby = [...areaByKey.values()]
    .filter((candidate) => (candidate.nearbyAreas || []).includes(key))
    .map((candidate) => candidate.key);
  return [...new Set([key, ...(area.nearbyAreas || []), ...reverseNearby])];
};
const round = (value) => Math.round(value * 100) / 100;

const calculateScore = ({ errand, trip, candidateTrustScore }) => {
  const requiredUnits = WEIGHT_CLASS_UNITS[errand.weightClass];
  const destinationScore = errand.destinationNeighborhood.key === trip.destinationNeighborhood.key
    ? SCORE_WEIGHTS.destination
    : SCORE_WEIGHTS.destination * 0.75;
  const deadline = errand.neededByTime || errand.expiresAt;
  const slackMs = Math.max(0, new Date(deadline) - new Date(trip.expectedReturnTime));
  const timeRatio = Math.max(0, 1 - slackMs / (TIME_SCORE_WINDOW_HOURS * 60 * 60 * 1000));
  const timeScore = SCORE_WEIGHTS.time * timeRatio;
  const loadScore = SCORE_WEIGHTS.load * Math.min(1, requiredUnits / trip.remainingCapacityUnits);
  const urgentBoost = errand.isUrgent ? SCORE_WEIGHTS.urgency : 0;
  const trust = Number(candidateTrustScore ?? TRUST_BASELINE);
  const trustPenalty = trust >= TRUST_BASELINE ? 0
    : SCORE_WEIGHTS.maximumTrustPenalty * ((TRUST_BASELINE - Math.max(0, trust)) / TRUST_BASELINE);
  const raw = destinationScore + timeScore + loadScore + urgentBoost - trustPenalty;

  return {
    matchScore: round(Math.max(0, Math.min(100, (raw / SCORE_WEIGHTS.maximumPositive) * 100))),
    destinationScore: round(destinationScore),
    timeScore: round(timeScore),
    loadScore: round(loadScore),
    urgentBoost: round(urgentBoost),
    trustPenalty: round(trustPenalty),
  };
};

const sortMatches = (matches) => matches.sort((a, b) =>
  b.score.matchScore - a.score.matchScore ||
  new Date(a.trip?.expectedReturnTime || a.errand?.neededByTime || a.errand?.expiresAt) -
    new Date(b.trip?.expectedReturnTime || b.errand?.neededByTime || b.errand?.expiresAt) ||
  (a.trip?.id || a.errand?.id).localeCompare(b.trip?.id || b.errand?.id));

const assertUsableAreaPair = (resource, label) => {
  if (!resource.neighborhood?.key || !resource.destinationNeighborhood?.key) {
    throw new ApiError(400, `${label} must have active origin and pickup/destination neighborhoods before matching.`);
  }
};

const getTripsForErrand = async (userId, errandId, limit) => {
  const errand = await repository.findErrandSource(errandId);
  if (!errand) throw new ApiError(404, "Errand not found.");
  if (errand.requesterId !== userId) throw new ApiError(403, "Only the errand owner can view its matches.");
  const now = new Date();
  if (errand.status !== "OPEN" || errand.expiresAt <= now) throw new ApiError(400, "Only open, unexpired errands can be matched.");
  assertUsableAreaPair(errand, "Errand");

  const requiredCapacityUnits = WEIGHT_CLASS_UNITS[errand.weightClass];
  const candidates = await repository.findCandidateTrips({
    errand: { ...errand, requiredCapacityUnits },
    originKeys: compatibleAreaKeys(errand.neighborhood.key),
    destinationKeys: compatibleAreaKeys(errand.destinationNeighborhood.key),
    now,
  });
  const matches = candidates
    .filter((trip) => WEIGHT_CLASS_UNITS[trip.maxCapacityClass] >= requiredCapacityUnits)
    .map((trip) => ({ trip, score: calculateScore({ errand, trip, candidateTrustScore: trip.traveler.trustScore }) }));

  return { matches: sortMatches(matches).slice(0, limit), limit, recalculatedAt: now };
};

const getErrandsForTrip = async (userId, tripId, limit) => {
  const trip = await repository.findTripSource(tripId);
  if (!trip) throw new ApiError(404, "Trip not found.");
  if (trip.travelerId !== userId) throw new ApiError(403, "Only the trip owner can view its matching errands.");
  const now = new Date();
  if (trip.status !== "ACTIVE" || trip.expiresAt <= now || !trip.expectedReturnTime) {
    throw new ApiError(400, "Only active, unexpired trips with an expected return time can be matched.");
  }
  assertUsableAreaPair(trip, "Trip");

  const candidates = await repository.findCandidateErrands({
    trip,
    originKeys: compatibleAreaKeys(trip.neighborhood.key),
    destinationKeys: compatibleAreaKeys(trip.destinationNeighborhood.key),
    now,
  });
  const maxClassUnits = WEIGHT_CLASS_UNITS[trip.maxCapacityClass];
  const matches = candidates
    .filter((errand) => {
      const units = WEIGHT_CLASS_UNITS[errand.weightClass];
      return units <= maxClassUnits && units <= trip.remainingCapacityUnits &&
        new Date(trip.expectedReturnTime) <= new Date(errand.neededByTime || errand.expiresAt);
    })
    .map((errand) => ({
      errand,
      score: calculateScore({ errand, trip, candidateTrustScore: errand.requester.trustScore }),
    }));

  return { matches: sortMatches(matches).slice(0, limit), limit, recalculatedAt: now };
};

module.exports = { compatibleAreaKeys, calculateScore, sortMatches, getTripsForErrand, getErrandsForTrip };
