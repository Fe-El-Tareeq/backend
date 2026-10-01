process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";

const repository = require("../src/features/wallet/wallet.repository");

describe("Wallet repository idempotency lookup", () => {
  test("queries by wallet and idempotency key together", async () => {
    const client = {
      walletTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await repository.findByIdempotencyKey(
      "wallet-1",
      "shared-key",
      client,
    );

    expect(client.walletTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        walletId: "wallet-1",
        idempotencyKey: "shared-key",
      },
    });
  });

  test("does not query when the wallet or key is missing", async () => {
    const client = {
      walletTransaction: {
        findFirst: jest.fn(),
      },
    };

    await expect(
      repository.findByIdempotencyKey(null, "shared-key", client),
    ).resolves.toBeNull();
    await expect(
      repository.findByIdempotencyKey("wallet-1", null, client),
    ).resolves.toBeNull();
    expect(client.walletTransaction.findFirst).not.toHaveBeenCalled();
  });
});
