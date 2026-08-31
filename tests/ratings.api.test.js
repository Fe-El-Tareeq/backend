process.env.NODE_ENV = "test";
jest.mock("../src/features/ratings/ratings.service");
jest.mock("../src/middleware/auth.middleware", () => ({ requireAuth: (req, res, next) => { req.user = { id: "550e8400-e29b-41d4-a716-446655440001" }; next(); } }));
const request = require("supertest");
const app = require("../src/app");
const service = require("../src/features/ratings/ratings.service");
const userId = "550e8400-e29b-41d4-a716-446655440001";
const assignmentId = "850e8400-e29b-41d4-a716-446655440000";

beforeEach(() => jest.clearAllMocks());

describe("Ratings API", () => {
  test("POST /api/v1/ratings creates a rating", async () => {
    service.createRating.mockResolvedValue({ created: true, rating: { id: "rating-1", assignmentId, ratingStars: 5 } });
    const response = await request(app).post("/api/v1/ratings").send({ assignmentId, ratingStars: 5, feedbackTags: ["ON_TIME"], paymentModalityConfirmed: "CASH" });
    expect(response.statusCode).toBe(201);
    expect(service.createRating).toHaveBeenCalledWith(userId, { assignmentId, ratingStars: 5, feedbackTags: ["ON_TIME"], paymentModalityConfirmed: "CASH" });
  });

  test("returns 200 for an identical idempotent replay", async () => {
    service.createRating.mockResolvedValue({ created: false, rating: { id: "rating-1" } });
    expect((await request(app).post("/api/v1/ratings").send({ assignmentId, ratingStars: 4 })).statusCode).toBe(200);
  });

  test.each([
    [{ assignmentId, ratingStars: 0 }, "stars below range"],
    [{ assignmentId, ratingStars: 6 }, "stars above range"],
    [{ assignmentId, ratingStars: 4.5 }, "non-integer stars"],
    [{ assignmentId, ratingStars: 5, feedbackTags: ["UNKNOWN"] }, "unknown tag"],
    [{ assignmentId, ratingStars: 5, feedbackTags: ["ON_TIME", "ON_TIME"] }, "duplicate tag"],
    [{ assignmentId, ratingStars: 5, feedbackTags: ["ON_TIME", "HELPFUL", "RESPECTFUL", "CAREFUL_HANDLING", "GOOD_COMMUNICATION", "LATE"] }, "more than five tags"],
    [{ assignmentId, ratingStars: 5, paymentModalityConfirmed: "CARD" }, "invalid payment modality"],
  ])("rejects invalid payload: %s", async (body) => {
    const response = await request(app).post("/api/v1/ratings").send(body);
    expect(response.statusCode).toBe(400);
    expect(service.createRating).not.toHaveBeenCalled();
  });

  test("GET endpoints pass validated identity, IDs, and pagination", async () => {
    service.getPending.mockResolvedValue({ pendingRatings: [], pagination: { skip: 0, take: 20, total: 0 } });
    service.getReceived.mockResolvedValue({ ratings: [], pagination: { skip: 2, take: 5, total: 0 } });
    service.getSummary.mockResolvedValue({ user: { id: userId }, ratingCount: 0, averageRating: null });
    service.getAssignmentRatings.mockResolvedValue({ ratings: [] });
    expect((await request(app).get("/api/v1/ratings/pending")).statusCode).toBe(200);
    expect((await request(app).get("/api/v1/ratings/me/received?skip=2&take=5")).statusCode).toBe(200);
    expect((await request(app).get("/api/v1/ratings/me/summary")).statusCode).toBe(200);
    expect((await request(app).get(`/api/v1/ratings/assignments/${assignmentId}`)).statusCode).toBe(200);
    expect(service.getPending).toHaveBeenCalledWith(userId, { skip: 0, take: 20 });
    expect(service.getReceived).toHaveBeenCalledWith(userId, { skip: 2, take: 5 });
    expect(service.getAssignmentRatings).toHaveBeenCalledWith(userId, assignmentId);
  });

  test("rejects invalid pagination and assignment ID", async () => {
    expect((await request(app).get("/api/v1/ratings/pending?take=51")).statusCode).toBe(400);
    expect((await request(app).get("/api/v1/ratings/assignments/not-a-uuid")).statusCode).toBe(400);
  });
});
