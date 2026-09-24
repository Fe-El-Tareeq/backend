const prisma = require("../../config/prisma");

// Runs multiple database operations inside one transaction.
const runTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

const findActiveNeighborhoodById = async (neighborhoodId, client = prisma) =>
  client.neighborhood.findFirst({
    where: { id: neighborhoodId, isActive: true, key: { not: null } },
    select: { id: true, key: true, name: true, governorate: true },
  });

// Returns the traveler information required before creating a trip.
const findTravelerForPosting = async (travelerId, client = prisma) => {
  return client.user.findUnique({
    where: {
      id: travelerId,
    },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      profileCompleted: true,
      status: true,
      neighborhoodId: true,
      neighborhood: {
        select: {
          id: true,
          key: true,
          name: true,
          governorate: true,
          isActive: true,
        },
      },
    },
  });
};

// Used for create-trip idempotency.
// The same clientRequestKey may not create two trips for the same traveler.
const findByTravelerAndClientKey = async (
  travelerId,
  clientRequestKey,
  client = prisma,
) => {
  return client.trip.findUnique({
    where: {
      travelerId_clientRequestKey: {
        travelerId,
        clientRequestKey,
      },
    },
    include: {
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      },
      destinationNeighborhood: {
        select: { id: true, key: true, name: true, governorate: true },
      },
    },
  });
};

// Creates a new trip.
const createTrip = async (data, client = prisma) => {
  return client.trip.create({
    data,
    include: {
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      },
      destinationNeighborhood: {
        select: { id: true, key: true, name: true, governorate: true },
      },
      traveler: {
        select: {
          id: true,
          fullName: true,
          trustScore: true,
        },
      },
    },
  });
};

// Returns safe trip details without exposing sensitive traveler data.
const findById = async (tripId, client = prisma) => {
  return client.trip.findUnique({
    where: {
      id: tripId,
    },
    include: {
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      },
      destinationNeighborhood: {
        select: { id: true, key: true, name: true, governorate: true },
      },
      traveler: {
        select: {
          id: true,
          fullName: true,
          trustScore: true,
        },
      },
    },
  });
};

// Builds the query used for listing trips.
const buildListWhere = ({
  userId,
  originNeighborhoodId,
  originAreaKeys,
  destinationNeighborhoodId,
  destinationAreaKeys,
  destinationKeyword,
  status,
  departureFrom,
  departureTo,
  mine = false,
  now = new Date(),
}) => {
  const where = {};

  if (mine) {
    where.travelerId = userId;
  }

  if (originNeighborhoodId) {
    where.neighborhoodId = originNeighborhoodId;
  }

  if (originAreaKeys) {
    where.neighborhood = { key: { in: originAreaKeys } };
  }

  if (destinationNeighborhoodId) {
    where.destinationNeighborhoodId = destinationNeighborhoodId;
  }

  if (destinationAreaKeys) {
    where.destinationNeighborhood = { key: { in: destinationAreaKeys } };
  }

  if (destinationKeyword) {
    where.destinationKeyword = {
      contains: destinationKeyword,
      mode: "insensitive",
    };
  }

  if (status) {
    where.status = status;
  } else {
    // By default, only active future trips are returned.
    where.status = "ACTIVE";
    where.expiresAt = {
      gt: now,
    };
  }

  if (departureFrom || departureTo) {
    where.departureTime = {};

    if (departureFrom) {
      where.departureTime.gte = new Date(departureFrom);
    }

    if (departureTo) {
      where.departureTime.lte = new Date(departureTo);
    }
  }

  return where;
};

// Returns a paginated list of trips.
const listTrips = async (
  {
    userId,
    originNeighborhoodId,
    originAreaKeys,
    destinationNeighborhoodId,
    destinationAreaKeys,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine,
    skip,
    take,
  },
  client = prisma,
) => {
  const where = buildListWhere({
    userId,
    originNeighborhoodId,
    originAreaKeys,
    destinationNeighborhoodId,
    destinationAreaKeys,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine,
  });

  return client.trip.findMany({
    where,
    skip,
    take,
    orderBy: [
      {
        departureTime: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
    include: {
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      },
      destinationNeighborhood: {
        select: { id: true, key: true, name: true, governorate: true },
      },
      traveler: {
        select: {
          id: true,
          fullName: true,
          trustScore: true,
        },
      },
    },
  });
};

// Counts trips using the same filters used by listTrips.
const countTrips = async (
  {
    userId,
    originNeighborhoodId,
    originAreaKeys,
    destinationNeighborhoodId,
    destinationAreaKeys,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine,
  },
  client = prisma,
) => {
  const where = buildListWhere({
    userId,
    originNeighborhoodId,
    originAreaKeys,
    destinationNeighborhoodId,
    destinationAreaKeys,
    destinationKeyword,
    status,
    departureFrom,
    departureTo,
    mine,
  });

  return client.trip.count({
    where,
  });
};

// Updates an existing trip.
const updateTrip = async (tripId, data, client = prisma) => {
  return client.trip.update({
    where: {
      id: tripId,
    },
    data,
    include: {
      neighborhood: {
        select: {
          id: true,
          name: true,
          governorate: true,
        },
      },
      traveler: {
        select: {
          id: true,
          fullName: true,
          trustScore: true,
        },
      },
    },
  });
};

const hasAcceptedAssignment = async (tripId, client = prisma) => {
  const count = await client.errandAssignment.count({
    where: {
      tripId,
    },
  });
  return count > 0;
};

module.exports = {
  buildListWhere,
  runTransaction,
  findActiveNeighborhoodById,
  findTravelerForPosting,
  findByTravelerAndClientKey,
  createTrip,
  findById,
  listTrips,
  countTrips,
  updateTrip,
  hasAcceptedAssignment,
};
