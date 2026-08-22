process.env.NODE_ENV = "test";

const request = require("supertest");

const app = require("../src/app");

describe("Trips Authentication", () => {
  test("POST /api/v1/trips returns 401 without access token", async () => {
    const response = await request(app).post("/api/v1/trips").send({});

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("GET /api/v1/trips returns 401 without access token", async () => {
    const response = await request(app).get("/api/v1/trips");

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("GET /api/v1/trips/:id returns 401 without access token", async () => {
    const response = await request(app).get(
      "/api/v1/trips/880e8400-e29b-41d4-a716-446655440000",
    );

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("PATCH /api/v1/trips/:id returns 401 without access token", async () => {
    const response = await request(app)
      .patch("/api/v1/trips/880e8400-e29b-41d4-a716-446655440000")
      .send({
        maxCapacityUnits: 5,
      });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("POST /api/v1/trips/:id/cancel returns 401 without access token", async () => {
    const response = await request(app).post(
      "/api/v1/trips/880e8400-e29b-41d4-a716-446655440000/cancel",
    );

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
