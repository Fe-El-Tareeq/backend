process.env.NODE_ENV = "test";
const request = require("supertest");
jest.mock("../src/features/proposals/proposals.service");
const app = require("../src/app");
const errandId = "650e8400-e29b-41d4-a716-446655440000";

test("proposal endpoints require authentication", async () => {
  const response = await request(app).get(
    `/api/v1/errands/${errandId}/proposals`,
  );
  expect(response.statusCode).toBe(401);
});
