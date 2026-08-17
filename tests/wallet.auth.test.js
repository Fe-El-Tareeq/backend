process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../src/features/wallet/wallet.service");

jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    req.user = {
      id: "user-1",
    };

    next();
  },
}));

const app = require("../src/app");
const walletService = require("../src/features/wallet/wallet.service");

describe("Wallet Authentication Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /api/v1/wallet should return 401 without authentication", async () => {
    const response = await request(app).get("/api/v1/wallet");

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: "Authentication is required",
    });

    expect(walletService.getWallet).not.toHaveBeenCalled();
  });

  test("GET /api/v1/wallet/transactions should return 401 without authentication", async () => {
    const response = await request(app).get(
      "/api/v1/wallet/transactions",
    );

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: "Authentication is required",
    });

    expect(
      walletService.getTransactionHistory,
    ).not.toHaveBeenCalled();
  });
});