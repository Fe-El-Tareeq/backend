process.env.NODE_ENV = "test";

require("dotenv").config({ quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for trips repository tests.");
}

// Force this integration test to use the local test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const crypto = require("crypto");

const prisma = require("../src/config/prisma");
const repository = require("../src/features/trips/trips.repository");

if (!process.env.DATABASE_URL.includes("wallet_test")) {
  throw new Error(
    "Trips repository tests must run against the local wallet_test database.",
  );
}

describe("Trips Repository Integration Tests", () => {
  let neighborhood;
  let travelerA;
  let travelerB;
  let tripA;

  beforeEach(async () => {
    neighborhood = await prisma.neighborhood.create({
      data: {
        name: `Test Neighborhood ${crypto.randomUUID()}`,
        governorate: "Test Governorate",
        isActive: true,
      },
    });

    travelerA = await prisma.user.create({
      data: {
        phone: `+970${crypto.randomInt(100000000, 999999999)}`,
        fullName: "Traveler A",
        phoneVerifiedAt: new Date(),
        profileCompleted: true,
        status: "ACTIVE",
        neighborhoodId: neighborhood.id,
      },
    });

    travelerB = await prisma.user.create({
      data: {
        phone: `+970${crypto.randomInt(100000000, 999999999)}`,
        fullName: "Traveler B",
        phoneVerifiedAt: new Date(),
        profileCompleted: true,
        status: "ACTIVE",
        neighborhoodId: neighborhood.id,
      },
    });

    const departureTime = new Date(Date.now() + 60 * 60 * 1000);

    tripA = await repository.createTrip({
      travelerId: travelerA.id,
      neighborhoodId: neighborhood.id,
      clientRequestKey: crypto.randomUUID(),
      destinationKeyword: "Ramallah",
      originType: "DEFAULT_NEIGHBORHOOD",
      customOriginKeyword: null,
      departureTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
      remainingCapacityUnits: 3,
      notes: "Repository integration test",
      status: "ACTIVE",
      expiresAt: departureTime,
    });
  });

  afterEach(async () => {
    await prisma.trip.deleteMany({
      where: {
        travelerId: {
          in: [travelerA.id, travelerB.id],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [travelerA.id, travelerB.id],
        },
      },
    });

    await prisma.neighborhood.deleteMany({
      where: {
        id: neighborhood.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("findTravelerForPosting returns safe traveler posting data", async () => {
    const traveler = await repository.findTravelerForPosting(travelerA.id);

    expect(traveler).toMatchObject({
      id: travelerA.id,
      status: "ACTIVE",
      profileCompleted: true,
      neighborhoodId: neighborhood.id,
    });

    expect(traveler.neighborhood).toMatchObject({
      id: neighborhood.id,
      isActive: true,
    });

    expect(traveler.passwordHash).toBeUndefined();
  });

  test("findByTravelerAndClientKey returns the matching trip", async () => {
    const result = await repository.findByTravelerAndClientKey(
      travelerA.id,
      tripA.clientRequestKey,
    );

    expect(result).not.toBeNull();
    expect(result.id).toBe(tripA.id);
    expect(result.travelerId).toBe(travelerA.id);
  });

  test("same traveler cannot reuse the same clientRequestKey", async () => {
    await expect(
      repository.createTrip({
        travelerId: travelerA.id,
        neighborhoodId: neighborhood.id,
        clientRequestKey: tripA.clientRequestKey,
        destinationKeyword: "Different destination",
        originType: "DEFAULT_NEIGHBORHOOD",
        customOriginKeyword: null,
        departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        maxCapacityClass: "LIGHT",
        maxCapacityUnits: 1,
        remainingCapacityUnits: 1,
        notes: null,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    });
  });

  test("different travelers can use the same clientRequestKey", async () => {
    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const secondTrip = await repository.createTrip({
      travelerId: travelerB.id,
      neighborhoodId: neighborhood.id,
      clientRequestKey: tripA.clientRequestKey,
      destinationKeyword: "Gaza City",
      originType: "DEFAULT_NEIGHBORHOOD",
      customOriginKeyword: null,
      departureTime,
      maxCapacityClass: "LIGHT",
      maxCapacityUnits: 2,
      remainingCapacityUnits: 2,
      notes: null,
      status: "ACTIVE",
      expiresAt: departureTime,
    });

    expect(secondTrip.travelerId).toBe(travelerB.id);

    expect(secondTrip.clientRequestKey).toBe(tripA.clientRequestKey);
  });

  test("findById returns safe trip details", async () => {
    const result = await repository.findById(tripA.id);

    expect(result.id).toBe(tripA.id);

    expect(result.traveler).toEqual(
      expect.objectContaining({
        id: travelerA.id,
        fullName: "Traveler A",
      }),
    );

    expect(result.traveler.phone).toBeUndefined();
    expect(result.traveler.passwordHash).toBeUndefined();
  });

  test("listTrips returns only active future trips by default", async () => {
    const expiredDeparture = new Date(Date.now() - 60 * 60 * 1000);

    await repository.createTrip({
      travelerId: travelerA.id,
      neighborhoodId: neighborhood.id,
      clientRequestKey: crypto.randomUUID(),
      destinationKeyword: "Expired destination",
      originType: "DEFAULT_NEIGHBORHOOD",
      customOriginKeyword: null,
      departureTime: expiredDeparture,
      maxCapacityClass: "LIGHT",
      maxCapacityUnits: 1,
      remainingCapacityUnits: 1,
      notes: null,
      status: "ACTIVE",
      expiresAt: expiredDeparture,
    });

    const trips = await repository.listTrips({
      userId: travelerA.id,
      mine: false,
      skip: 0,
      take: 20,
    });

    expect(trips.some((trip) => trip.id === tripA.id)).toBe(true);

    expect(
      trips.some((trip) => trip.destinationKeyword === "Expired destination"),
    ).toBe(false);
  });

  test("mine filter returns only current traveler's trips", async () => {
    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await repository.createTrip({
      travelerId: travelerB.id,
      neighborhoodId: neighborhood.id,
      clientRequestKey: crypto.randomUUID(),
      destinationKeyword: "Traveler B destination",
      originType: "DEFAULT_NEIGHBORHOOD",
      customOriginKeyword: null,
      departureTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 2,
      remainingCapacityUnits: 2,
      notes: null,
      status: "ACTIVE",
      expiresAt: departureTime,
    });

    const trips = await repository.listTrips({
      userId: travelerA.id,
      mine: true,
      skip: 0,
      take: 20,
    });

    expect(trips.length).toBeGreaterThan(0);

    expect(trips.every((trip) => trip.travelerId === travelerA.id)).toBe(true);
  });

  test("countTrips uses the same filters as listTrips", async () => {
    const count = await repository.countTrips({
      userId: travelerA.id,
      mine: true,
    });

    expect(count).toBe(1);
  });

  test("updateTrip updates editable data", async () => {
    const updated = await repository.updateTrip(tripA.id, {
      maxCapacityUnits: 5,
      remainingCapacityUnits: 5,
      notes: "Updated repository test",
    });

    expect(updated).toMatchObject({
      id: tripA.id,
      maxCapacityUnits: 5,
      remainingCapacityUnits: 5,
      notes: "Updated repository test",
    });
  });
});
