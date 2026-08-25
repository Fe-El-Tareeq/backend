const prisma = require("../../config/prisma");

const areaSelect = { id: true, key: true, name: true, governorate: true };
const safeUserSelect = { id: true, fullName: true, trustScore: true, profileImageUrl: true };

const findErrandSource = (id, client = prisma) => client.errand.findUnique({
  where: { id },
  include: {
    neighborhood: { select: areaSelect },
    destinationNeighborhood: { select: areaSelect },
    requester: { select: safeUserSelect },
  },
});

const findTripSource = (id, client = prisma) => client.trip.findUnique({
  where: { id },
  include: {
    neighborhood: { select: areaSelect },
    destinationNeighborhood: { select: areaSelect },
    traveler: { select: safeUserSelect },
  },
});

const findCandidateTrips = ({ errand, originKeys, destinationKeys, now }, client = prisma) => client.trip.findMany({
  where: {
    status: "ACTIVE",
    expiresAt: { gt: now },
    expectedReturnTime: { not: null, lte: errand.neededByTime || errand.expiresAt },
    departureTime: { gt: now },
    travelerId: { not: errand.requesterId },
    remainingCapacityUnits: { gte: errand.requiredCapacityUnits },
    neighborhood: { key: { in: originKeys } },
    destinationNeighborhood: { key: { in: destinationKeys } },
  },
  include: {
    neighborhood: { select: areaSelect },
    destinationNeighborhood: { select: areaSelect },
    traveler: { select: safeUserSelect },
  },
});

const findCandidateErrands = ({ trip, originKeys, destinationKeys, now }, client = prisma) => client.errand.findMany({
  where: {
    status: "OPEN",
    expiresAt: { gt: now },
    OR: [
      { neededByTime: { gte: trip.expectedReturnTime } },
      { neededByTime: null, expiresAt: { gte: trip.expectedReturnTime } },
    ],
    requesterId: { not: trip.travelerId },
    neighborhood: { key: { in: originKeys } },
    destinationNeighborhood: { key: { in: destinationKeys } },
  },
  include: {
    neighborhood: { select: areaSelect },
    destinationNeighborhood: { select: areaSelect },
    requester: { select: safeUserSelect },
  },
});

module.exports = { findErrandSource, findTripSource, findCandidateTrips, findCandidateErrands };
