process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../src/features/trips/trips.service");

jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => {
    req.user = {
      id: "550e8400-e29b-41d4-a716-446655440000",
    };

    next();
  },
}));

const app = require("../src/app");
const tripsService = require("../src/features/trips/trips.service");

const travelerId = "550e8400-e29b-41d4-a716-446655440000";

const tripId = "880e8400-e29b-41d4-a716-446655440000";

const clientRequestKey = "770e8400-e29b-41d4-a716-446655440000";
const destinationNeighborhoodId = "990e8400-e29b-41d4-a716-446655440000";

const validDepartureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const validReturnTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

const trip = {
  id: tripId,
  travelerId,
  clientRequestKey,
  neighborhoodId: "660e8400-e29b-41d4-a716-446655440000",
  destinationKeyword: "Ramallah",
  destinationNeighborhoodId,
  originType: "DEFAULT_NEIGHBORHOOD",
  customOriginKeyword: null,
  departureTime: validDepartureTime,
  expectedReturnTime: validReturnTime,
  maxCapacityClass: "MEDIUM",
  maxCapacityUnits: 3,
  remainingCapacityUnits: 3,
  notes: null,
  status: "ACTIVE",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Trips API", () => {
  test("POST /api/v1/trips creates a trip", async () => {
    tripsService.createTrip.mockResolvedValue(trip);

    const response = await request(app).post("/api/v1/trips").send({
      clientRequestKey,
      originType: "DEFAULT_NEIGHBORHOOD",
      destinationKeyword: "Ramallah",
      destinationNeighborhoodId,
      departureTime: validDepartureTime,
      expectedReturnTime: validReturnTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Trip created successfully.");

    expect(tripsService.createTrip).toHaveBeenCalledWith(
      travelerId,
      expect.objectContaining({
        clientRequestKey,
        originType: "DEFAULT_NEIGHBORHOOD",
        destinationKeyword: "Ramallah",
        destinationNeighborhoodId,
        maxCapacityClass: "MEDIUM",
        maxCapacityUnits: 3,
      }),
    );
  });

  test("GET /api/v1/trips returns paginated trips", async () => {
    tripsService.getTrips.mockResolvedValue({
      trips: [trip],
      pagination: {
        skip: 0,
        take: 20,
        total: 1,
      },
    });

    const response = await request(app).get("/api/v1/trips");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(tripsService.getTrips).toHaveBeenCalledWith(
      travelerId,
      expect.objectContaining({
        skip: 0,
        take: 20,
        mine: false,
      }),
    );
  });

  test("GET /api/v1/trips/:id returns trip details", async () => {
    tripsService.getTripById.mockResolvedValue(trip);

    const response = await request(app).get(`/api/v1/trips/${tripId}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(tripId);

    expect(tripsService.getTripById).toHaveBeenCalledWith(tripId);
  });

  test("PATCH /api/v1/trips/:id updates a trip", async () => {
    tripsService.updateTrip.mockResolvedValue({
      ...trip,
      maxCapacityUnits: 5,
    });

    const response = await request(app).patch(`/api/v1/trips/${tripId}`).send({
      maxCapacityUnits: 5,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(tripsService.updateTrip).toHaveBeenCalledWith(travelerId, tripId, {
      maxCapacityUnits: 5,
    });
  });

  test("POST /api/v1/trips/:id/cancel cancels a trip", async () => {
    tripsService.cancelTrip.mockResolvedValue({
      ...trip,
      status: "CANCELLED",
    });

    const response = await request(app).post(`/api/v1/trips/${tripId}/cancel`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("CANCELLED");

    expect(tripsService.cancelTrip).toHaveBeenCalledWith(travelerId, tripId);
  });

  test("POST /api/v1/trips rejects invalid origin data", async () => {
    const response = await request(app).post("/api/v1/trips").send({
      clientRequestKey,
      originType: "CUSTOM_KEYWORD",
      destinationKeyword: "Ramallah",
      destinationNeighborhoodId,
      departureTime: validDepartureTime,
      expectedReturnTime: validReturnTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");

    expect(tripsService.createTrip).not.toHaveBeenCalled();
  });

  test("POST /api/v1/trips rejects departure time that is too soon", async () => {
    const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const response = await request(app).post("/api/v1/trips").send({
      clientRequestKey,
      originType: "DEFAULT_NEIGHBORHOOD",
      destinationKeyword: "Ramallah",
      destinationNeighborhoodId,
      departureTime: tooSoon,
      expectedReturnTime: validReturnTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);

    expect(tripsService.createTrip).not.toHaveBeenCalled();
  });

  test("POST /api/v1/trips rejects departure time more than 3 days away", async () => {
    const tooFar = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app).post("/api/v1/trips").send({
      clientRequestKey,
      originType: "DEFAULT_NEIGHBORHOOD",
      destinationKeyword: "Ramallah",
      destinationNeighborhoodId,
      departureTime: tooFar,
      expectedReturnTime: new Date(Date.now() + 97 * 60 * 60 * 1000).toISOString(),
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
    });

    expect(response.statusCode).toBe(400);

    expect(tripsService.createTrip).not.toHaveBeenCalled();
  });

  test("PATCH /api/v1/trips/:id rejects immutable trip fields", async () => {
    const response = await request(app).patch(`/api/v1/trips/${tripId}`).send({
      destinationKeyword: "Another place",
    });

    expect(response.statusCode).toBe(400);

    expect(tripsService.updateTrip).not.toHaveBeenCalled();
  });

  test("traveler cannot submit or edit the server-calculated delivery fee", async () => {
    const createResponse = await request(app).post("/api/v1/trips").send({
      clientRequestKey,
      originType: "DEFAULT_NEIGHBORHOOD",
      destinationKeyword: "Ramallah",
      destinationNeighborhoodId,
      departureTime: validDepartureTime,
      expectedReturnTime: validReturnTime,
      maxCapacityClass: "MEDIUM",
      maxCapacityUnits: 3,
      deliveryFeeNis: 15,
    });
    expect(createResponse.statusCode).toBe(400);

    const updateResponse = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .send({ deliveryFeeNis: 15 });
    expect(updateResponse.statusCode).toBe(400);
    expect(tripsService.createTrip).not.toHaveBeenCalled();
    expect(tripsService.updateTrip).not.toHaveBeenCalled();
  });

  test("GET /api/v1/trips/:id rejects invalid UUID", async () => {
    const response = await request(app).get("/api/v1/trips/not-a-uuid");

    expect(response.statusCode).toBe(400);

    expect(tripsService.getTripById).not.toHaveBeenCalled();
  });
});
