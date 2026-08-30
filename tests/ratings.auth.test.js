process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");
const app = require("../src/app");
const assignmentId = "850e8400-e29b-41d4-a716-446655440000";

describe("Ratings authentication", () => {
  test.each([
    ["post", "/api/v1/ratings"],
    ["get", "/api/v1/ratings/pending"],
    ["get", "/api/v1/ratings/me/received"],
    ["get", "/api/v1/ratings/me/summary"],
    ["get", `/api/v1/ratings/assignments/${assignmentId}`],
  ])("%s %s requires an access token", async (method, path) => {
    const response = await request(app)[method](path).send(method === "post" ? { assignmentId, ratingStars: 5 } : undefined);
    expect(response.statusCode).toBe(401);
  });
});
