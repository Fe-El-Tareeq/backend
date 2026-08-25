process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test";

jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => { req.user = { id: "550e8400-e29b-41d4-a716-446655440000" }; next(); },
}));
jest.mock("../src/features/users/users.repository");
jest.mock("../src/features/deliveryPricing/deliveryPricing.service");

const request = require("supertest");
const app = require("../src/app");
const usersRepository = require("../src/features/users/users.repository");
const pricingService = require("../src/features/deliveryPricing/deliveryPricing.service");

describe("Delivery pricing API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersRepository.findUserById.mockResolvedValue({ neighborhoodId: "660e8400-e29b-41d4-a716-446655440000" });
    pricingService.quoteByNeighborhoodIds.mockResolvedValue({ deliveryFeeNis: 3, pricingRule: "NEARBY_AREA", pricingVersion: 1, currency: "NIS" });
  });

  test("returns a quote using the authenticated user's neighborhood", async () => {
    const destinationId = "990e8400-e29b-41d4-a716-446655440000";
    const response = await request(app).get(`/api/v1/delivery-pricing/quote?destinationNeighborhoodId=${destinationId}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.deliveryFeeNis).toBe(3);
    expect(pricingService.quoteByNeighborhoodIds).toHaveBeenCalledWith("660e8400-e29b-41d4-a716-446655440000", destinationId);
  });

  test("rejects an invalid destination neighborhood ID", async () => {
    const response = await request(app).get("/api/v1/delivery-pricing/quote?destinationNeighborhoodId=bad");
    expect(response.statusCode).toBe(400);
    expect(pricingService.quoteByNeighborhoodIds).not.toHaveBeenCalled();
  });
});
