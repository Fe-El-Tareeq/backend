const request = require("supertest");
const express = require("express");
const app = require("../src/app");
const { createRateLimiter } = require("../src/middleware/rateLimit.middleware");

describe("Core Middleware Tests", () => {
  // Verifies that the server health endpoint is available and working.
  test("GET /health should return 200", async () => {
    const response = await request(app).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  // Verifies that invalid request data is rejected by the validation middleware.
  test("POST /api/test/validation should return 400 for invalid data", async () => {
    const response = await request(app).post("/api/test/validation").send({
      name: "Fa",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");

    // Checks that the validation error points to the correct field.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "body.name",
        }),
      ]),
    );
  });

  // Verifies that valid request data passes through the validation middleware.
  test.each(["Farah", "Leenah"])(
    "POST /api/test/validation should return 200 for valid name %s",
    async (name) => {
      const response = await request(app).post("/api/test/validation").send({
        name: name,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Validation passed");
      expect(response.body.data.body.name).toBe(name);
    },
  );

  // Verifies that requests to unknown routes are handled by the 404 middleware.
  test("Unknown route should return 404", async () => {
    const response = await request(app).get("/api/anything-not-found");

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Route not found");
  });

  // Verifies that requests exceeding the configured limit are blocked.
  test("Rate limiter should return 429 after exceeding the limit", async () => {
    const testApp = express();

    // Creates a separate rate limiter for testing without changing the real API settings.
    testApp.use(
      createRateLimiter({
        windowMs: 60 * 1000,
        limit: 3,
      }),
    );

    // Test endpoint used only to verify the rate limiter behavior.
    testApp.get("/rate-limit-test", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Request allowed",
      });
    });

    // The first three requests should be allowed.
    await request(testApp).get("/rate-limit-test");
    await request(testApp).get("/rate-limit-test");
    await request(testApp).get("/rate-limit-test");

    // The fourth request should be blocked by the rate limiter.
    const response = await request(testApp).get("/rate-limit-test");

    expect(response.statusCode).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Too many requests. Please try again later.",
    );
    expect(response.body.errors).toEqual([]);
  });
});
