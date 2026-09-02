process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");
const app = require("../src/app");
const invoiceId = "750e8400-e29b-41d4-a716-446655440001";

describe("Payments authentication", () => {
  test.each([
    ["get", "/api/v1/payments/packages"],
    ["post", "/api/v1/payments/invoices"],
    ["get", "/api/v1/payments/invoices"],
    ["get", `/api/v1/payments/invoices/${invoiceId}`],
    ["post", `/api/v1/payments/mock/invoices/${invoiceId}/pay`],
  ])("%s %s requires an access token", async (method, path) => {
    const response = await request(app)[method](path).send({});
    expect(response.statusCode).toBe(401);
  });
});
