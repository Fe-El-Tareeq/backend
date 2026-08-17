process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../src/features/wallet/wallet.service");
jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => {
    req.user = {
      id: "user-1",
    };
    next();
  },
}));

const app = require("../src/app");
const walletService = require("../src/features/wallet/wallet.service");

describe("Wallet API Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Returns the authenticated user's wallet.
  test("GET /api/v1/wallet should return the user's wallet", async () => {
    walletService.getWallet.mockResolvedValue({
      id: "wallet-1",
      userId: "user-1",
      tokenBalance: 5,
    });

    const response = await request(app).get("/api/v1/wallet");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Wallet retrieved successfully.");

    expect(response.body.data).toMatchObject({
      id: "wallet-1",
      userId: "user-1",
      tokenBalance: 5,
    });

    expect(walletService.getWallet).toHaveBeenCalledWith("user-1");
  });

  // Returns wallet transactions using the default pagination values.
  test("GET /api/v1/wallet/transactions should return transaction history", async () => {
    walletService.getTransactionHistory.mockResolvedValue({
      transactions: [],
      pagination: {
        skip: 0,
        take: 20,
        total: 0,
      },
    });

    const response = await request(app).get("/api/v1/wallet/transactions");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(walletService.getTransactionHistory).toHaveBeenCalledWith("user-1", {
      skip: 0,
      take: 20,
    });

    expect(response.body.data.pagination).toEqual({
      skip: 0,
      take: 20,
      total: 0,
    });
  });

  // Passes valid pagination values to the service.
  test("GET /api/v1/wallet/transactions should accept valid pagination", async () => {
    walletService.getTransactionHistory.mockResolvedValue({
      transactions: [],
      pagination: {
        skip: 10,
        take: 5,
        total: 20,
      },
    });

    const response = await request(app).get(
      "/api/v1/wallet/transactions?skip=10&take=5",
    );

    expect(response.statusCode).toBe(200);

    expect(walletService.getTransactionHistory).toHaveBeenCalledWith("user-1", {
      skip: 10,
      take: 5,
    });
  });

  // Rejects invalid pagination before calling the wallet service.
  test("GET /api/v1/wallet/transactions should reject invalid pagination", async () => {
    const response = await request(app).get(
      "/api/v1/wallet/transactions?skip=-1&take=0",
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");

    expect(walletService.getTransactionHistory).not.toHaveBeenCalled();
  });

  // Confirms that wallet balance cannot be modified through a public POST endpoint.
  test("POST /api/v1/wallet should not exist", async () => {
    const response = await request(app).post("/api/v1/wallet").send({
      amount: 10,
    });

    expect(response.statusCode).toBe(404);
  });
});
