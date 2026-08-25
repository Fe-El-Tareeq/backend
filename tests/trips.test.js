process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

jest.mock("../src/features/trips/trips.repository");
jest.mock("../src/features/deliveryPricing/deliveryPricing.service");

const repository = require("../src/features/trips/trips.repository");
const service = require("../src/features/trips/trips.service");
const deliveryPricingService = require("../src/features/deliveryPricing/deliveryPricing.service");

const tx = {
  transaction: "test",
};

const traveler = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  phone: "+970599000000",
  phoneVerifiedAt: new Date(),
  profileCompleted: true,
  status: "ACTIVE",
  neighborhoodId: "660e8400-e29b-41d4-a716-446655440000",
  neighborhood: {
    id: "660e8400-e29b-41d4-a716-446655440000",
    name: "Test Neighborhood",
    governorate: "Test Governorate",
    isActive: true,
    key: "AN_NASER",
  },
};

const createData = {
  clientRequestKey: "770e8400-e29b-41d4-a716-446655440000",
  originType: "DEFAULT_NEIGHBORHOOD",
  customOriginKeyword: null,
  destinationKeyword: "Ramallah City Center",
  destinationNeighborhoodId: "990e8400-e29b-41d4-a716-446655440000",
  departureTime: "2026-08-24T10:30:00+03:00",
  expectedReturnTime: "2026-08-24T13:30:00+03:00",
  maxCapacityClass: "MEDIUM",
  maxCapacityUnits: 3,
  notes: "Leaving from the main street",
};

const createdTrip = {
  id: "880e8400-e29b-41d4-a716-446655440000",
  travelerId: traveler.id,
  neighborhoodId: traveler.neighborhoodId,
  ...createData,
  departureTime: new Date(createData.departureTime),
  expectedReturnTime: new Date(createData.expectedReturnTime),
  remainingCapacityUnits: 3,
  status: "ACTIVE",
  expiresAt: new Date(createData.departureTime),
};

beforeEach(() => {
  jest.clearAllMocks();

  repository.runTransaction.mockImplementation(async (callback) =>
    callback(tx),
  );

  repository.findByTravelerAndClientKey.mockResolvedValue(null);

  repository.findTravelerForPosting.mockResolvedValue(traveler);

  repository.createTrip.mockResolvedValue(createdTrip);
  deliveryPricingService.quoteByNeighborhoodIds.mockResolvedValue({
    deliveryFeeNis: 5,
    pricingRule: "SAME_ZONE",
    pricingVersion: 1,
  });
});

describe("Trips create", () => {
  test("creates a valid trip without deducting wallet tokens", async () => {
    const result = await service.createTrip(traveler.id, createData);

    expect(repository.findByTravelerAndClientKey).toHaveBeenCalledWith(
      traveler.id,
      createData.clientRequestKey,
      tx,
    );

    expect(repository.findTravelerForPosting).toHaveBeenCalledWith(
      traveler.id,
      tx,
    );

    expect(repository.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        travelerId: traveler.id,
        neighborhoodId: traveler.neighborhoodId,
        clientRequestKey: createData.clientRequestKey,
        originType: "DEFAULT_NEIGHBORHOOD",
        customOriginKeyword: null,
        destinationKeyword: "Ramallah City Center",
        destinationNeighborhoodId: createData.destinationNeighborhoodId,
        deliveryFeeNis: 5,
        pricingRule: "SAME_ZONE",
        pricingVersion: 1,
        expectedReturnTime: new Date(createData.expectedReturnTime),
        maxCapacityClass: "MEDIUM",
        maxCapacityUnits: 3,
        remainingCapacityUnits: 3,
        status: "ACTIVE",
      }),
      tx,
    );

    expect(result).toBe(createdTrip);
  });

  test("uses the profile neighborhood when creating a trip", async () => {
    await service.createTrip(traveler.id, createData);

    expect(repository.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        neighborhoodId: traveler.neighborhoodId,
      }),
      tx,
    );
  });

  test("stores custom origin when origin type is CUSTOM_KEYWORD", async () => {
    const customData = {
      ...createData,
      originType: "CUSTOM_KEYWORD",
      customOriginKeyword: "  Al Manara Square  ",
      originNeighborhoodId: "aa0e8400-e29b-41d4-a716-446655440000",
    };

    await service.createTrip(traveler.id, customData);

    expect(repository.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        originType: "CUSTOM_KEYWORD",
        customOriginKeyword: "Al Manara Square",
      }),
      tx,
    );
  });

  test("rejects a suspended traveler", async () => {
    repository.findTravelerForPosting.mockResolvedValue({
      ...traveler,
      status: "SUSPENDED",
    });

    await expect(
      service.createTrip(traveler.id, createData),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "User is not active.",
    });

    expect(repository.createTrip).not.toHaveBeenCalled();
  });

  test("rejects traveler with incomplete profile", async () => {
    repository.findTravelerForPosting.mockResolvedValue({
      ...traveler,
      profileCompleted: false,
    });

    await expect(
      service.createTrip(traveler.id, createData),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Profile must be completed before creating a trip.",
    });

    expect(repository.createTrip).not.toHaveBeenCalled();
  });

  test("rejects traveler without neighborhood", async () => {
    repository.findTravelerForPosting.mockResolvedValue({
      ...traveler,
      neighborhoodId: null,
      neighborhood: null,
    });

    await expect(
      service.createTrip(traveler.id, createData),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A neighborhood must be selected before creating a trip.",
    });

    expect(repository.createTrip).not.toHaveBeenCalled();
  });
});

describe("Trips create idempotency", () => {
  test("returns existing trip when the same key and same payload are retried", async () => {
    const existingTrip = {
      ...createdTrip,
      originType: createData.originType,
      customOriginKeyword: null,
      destinationKeyword: createData.destinationKeyword,
      maxCapacityClass: createData.maxCapacityClass,
      maxCapacityUnits: createData.maxCapacityUnits,
      notes: createData.notes,
    };

    repository.findByTravelerAndClientKey.mockResolvedValue(existingTrip);

    const result = await service.createTrip(traveler.id, createData);

    expect(result).toBe(existingTrip);

    expect(repository.findTravelerForPosting).not.toHaveBeenCalled();

    expect(repository.createTrip).not.toHaveBeenCalled();
  });

  test("returns 409 when the same key is reused with different trip data", async () => {
    repository.findByTravelerAndClientKey.mockResolvedValue({
      ...createdTrip,
      destinationKeyword: "Different Destination",
    });

    await expect(
      service.createTrip(traveler.id, createData),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Client request key has already been used with different trip data.",
    });

    expect(repository.createTrip).not.toHaveBeenCalled();
  });
});

describe("Trips list and details", () => {
  test("returns trips with pagination", async () => {
    repository.listTrips.mockResolvedValue([createdTrip]);

    repository.countTrips.mockResolvedValue(1);

    const result = await service.getTrips(traveler.id, {
      skip: 0,
      take: 20,
      mine: true,
    });

    expect(repository.listTrips).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: traveler.id,
        mine: true,
        skip: 0,
        take: 20,
      }),
    );

    expect(result.pagination).toEqual({
      skip: 0,
      take: 20,
      total: 1,
    });

    expect(result.trips).toHaveLength(1);
  });

  test("returns 404 when trip does not exist", async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getTripById("missing-trip")).rejects.toMatchObject({
      statusCode: 404,
      message: "Trip not found.",
    });
  });
});

describe("Trips update", () => {
  const activeTrip = {
    ...createdTrip,
    departureTime: new Date(Date.now() + 60 * 60 * 1000),
    expectedReturnTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    maxCapacityUnits: 5,
    remainingCapacityUnits: 3,
  };

  beforeEach(() => {
    repository.findById.mockResolvedValue(activeTrip);

    repository.updateTrip.mockImplementation(async (id, data) => ({
      ...activeTrip,
      id,
      ...data,
    }));
  });

  test("owner can update an active trip", async () => {
    await service.updateTrip(traveler.id, activeTrip.id, {
      maxCapacityUnits: 6,
      notes: "Updated notes",
    });

    // 2 capacity units are already used:
    // 5 max - 3 remaining = 2 used.
    // New remaining = 6 - 2 = 4.
    expect(repository.updateTrip).toHaveBeenCalledWith(
      activeTrip.id,
      expect.objectContaining({
        maxCapacityUnits: 6,
        remainingCapacityUnits: 4,
        notes: "Updated notes",
      }),
      tx,
    );
  });

  test("non-owner cannot update a trip", async () => {
    await expect(
      service.updateTrip("different-user", activeTrip.id, {
        maxCapacityUnits: 6,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not allowed to manage this trip.",
    });

    expect(repository.updateTrip).not.toHaveBeenCalled();
  });

  test("cannot reduce capacity below already used capacity", async () => {
    await expect(
      service.updateTrip(traveler.id, activeTrip.id, {
        maxCapacityUnits: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Maximum capacity cannot be lower than the already used capacity.",
    });

    expect(repository.updateTrip).not.toHaveBeenCalled();
  });
});

describe("Trips cancel", () => {
  test("owner can cancel an active future trip", async () => {
    const activeTrip = {
      ...createdTrip,
      departureTime: new Date(Date.now() + 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "ACTIVE",
    };

    repository.findById.mockResolvedValue(activeTrip);

    repository.updateTrip.mockResolvedValue({
      ...activeTrip,
      status: "CANCELLED",
    });

    const result = await service.cancelTrip(traveler.id, activeTrip.id);

    expect(repository.updateTrip).toHaveBeenCalledWith(
      activeTrip.id,
      {
        status: "CANCELLED",
      },
      tx,
    );

    expect(result.status).toBe("CANCELLED");
  });

  test("non-owner cannot cancel a trip", async () => {
    repository.findById.mockResolvedValue({
      ...createdTrip,
      departureTime: new Date(Date.now() + 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "ACTIVE",
    });

    await expect(
      service.cancelTrip("different-user", createdTrip.id),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not allowed to cancel this trip.",
    });
  });

  test("expired trip cannot be cancelled", async () => {
    repository.findById.mockResolvedValue({
      ...createdTrip,
      departureTime: new Date(Date.now() - 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
      status: "ACTIVE",
    });

    await expect(
      service.cancelTrip(traveler.id, createdTrip.id),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Expired trips cannot be cancelled.",
    });
  });
});
