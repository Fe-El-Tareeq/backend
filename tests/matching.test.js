process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/matching/matching.repository");
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));

const app = require("../src/app");
const prisma = require("../src/config/prisma");
const repository = require("../src/features/matching/matching.repository");
const service = require("../src/features/matching/matching.service");

const userId = "550e8400-e29b-41d4-a716-446655440000";
const otherUserId = "550e8400-e29b-41d4-a716-446655440001";
const errandId = "650e8400-e29b-41d4-a716-446655440000";
const tripId = "750e8400-e29b-41d4-a716-446655440000";
const token = jwt.sign({ type: "access", userId, role: "USER" }, process.env.JWT_ACCESS_SECRET);
const area = (id, key) => ({ id, key, name: key, governorate: "Gaza" });
const origin = area("850e8400-e29b-41d4-a716-446655440000", "AN_NASER");
const destination = area("950e8400-e29b-41d4-a716-446655440000", "ASH_SHUJAIYEH");
const nowPlus = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

const makeErrand = (overrides = {}) => ({
  id: errandId,
  requesterId: userId,
  neighborhood: origin,
  destinationNeighborhood: destination,
  weightClass: "LIGHT",
  isUrgent: false,
  status: "OPEN",
  neededByTime: nowPlus(8),
  expiresAt: nowPlus(8),
  requester: { id: userId, fullName: "Requester", trustScore: 80 },
  ...overrides,
});

const makeTrip = (overrides = {}) => ({
  id: tripId,
  travelerId: otherUserId,
  neighborhood: origin,
  destinationNeighborhood: destination,
  departureTime: nowPlus(1),
  expectedReturnTime: nowPlus(4),
  expiresAt: nowPlus(4),
  maxCapacityClass: "MEDIUM",
  remainingCapacityUnits: 3,
  status: "ACTIVE",
  deliveryFeeNis: 5,
  traveler: { id: otherUserId, fullName: "Traveler", trustScore: 80 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: userId, role: "USER", status: "ACTIVE" });
  repository.findErrandSource.mockResolvedValue(makeErrand());
  repository.findTripSource.mockResolvedValue(makeTrip({ travelerId: userId }));
  repository.findCandidateTrips.mockResolvedValue([makeTrip()]);
  repository.findCandidateErrands.mockResolvedValue([makeErrand({ requesterId: otherUserId })]);
});

describe("Matching hard filters and ranking", () => {
  test("returns compatible trips and passes hard-filter inputs to the repository", async () => {
    const result = await service.getTripsForErrand(userId, errandId, 10);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].trip.id).toBe(tripId);
    expect(result.matches[0].score.matchScore).toBeGreaterThan(0);
    expect(repository.findCandidateTrips).toHaveBeenCalledWith(expect.objectContaining({
      errand: expect.objectContaining({ requiredCapacityUnits: 1 }),
      originKeys: expect.arrayContaining(["AN_NASER"]),
      destinationKeys: expect.arrayContaining(["ASH_SHUJAIYEH"]),
      now: expect.any(Date),
    }));
  });

  test("excludes a trip whose capacity class is below the errand weight class", async () => {
    repository.findErrandSource.mockResolvedValue(makeErrand({ weightClass: "HEAVY" }));
    repository.findCandidateTrips.mockResolvedValue([makeTrip({ maxCapacityClass: "MEDIUM" })]);
    const result = await service.getTripsForErrand(userId, errandId, 10);
    expect(result.matches).toEqual([]);
  });

  test("ranks higher trust above lower trust when other inputs are equal", async () => {
    repository.findCandidateTrips.mockResolvedValue([
      makeTrip({ id: "750e8400-e29b-41d4-a716-446655440002", traveler: { trustScore: 20 } }),
      makeTrip({ id: "750e8400-e29b-41d4-a716-446655440001", traveler: { trustScore: 90 } }),
    ]);
    const result = await service.getTripsForErrand(userId, errandId, 10);
    expect(result.matches[0].trip.traveler.trustScore).toBe(90);
    expect(result.matches[1].score.trustPenalty).toBeGreaterThan(0);
  });

  test("only the source resource owner may view matches", async () => {
    await expect(service.getTripsForErrand(otherUserId, errandId, 10)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.getErrandsForTrip(otherUserId, tripId, 10)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("returns compatible errands for the trip owner", async () => {
    const result = await service.getErrandsForTrip(userId, tripId, 10);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].errand.id).toBe(errandId);
  });
});

describe("Matching API", () => {
  test("GET /matching/errands/:id is authenticated and returns matches", async () => {
    const response = await request(app)
      .get(`/api/v1/matching/errands/${errandId}?limit=5`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.matches).toHaveLength(1);
    expect(response.body.data.limit).toBe(5);
  });

  test("GET /matching/trips/:id is authenticated", async () => {
    const unauthenticated = await request(app).get(`/api/v1/matching/trips/${tripId}`);
    expect(unauthenticated.statusCode).toBe(401);
    const response = await request(app)
      .get(`/api/v1/matching/trips/${tripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.matches).toHaveLength(1);
  });

  test("rejects limits above 20", async () => {
    const response = await request(app)
      .get(`/api/v1/matching/errands/${errandId}?limit=21`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(400);
    expect(repository.findErrandSource).not.toHaveBeenCalled();
  });

  test("does not expose legacy nested matching aliases", async () => {
    const errandAlias = await request(app)
      .get(`/api/v1/errands/${errandId}/matches`)
      .set("Authorization", `Bearer ${token}`);
    const tripAlias = await request(app)
      .get(`/api/v1/trips/${tripId}/matching-errands`)
      .set("Authorization", `Bearer ${token}`);

    expect(errandAlias.statusCode).toBe(404);
    expect(tripAlias.statusCode).toBe(404);
  });
});
