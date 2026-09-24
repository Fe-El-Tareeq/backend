process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const bcrypt = require("bcryptjs");
jest.mock("../src/features/auth/auth.repository");
jest.mock("../src/features/wallet/wallet.repository");
jest.mock("../src/features/legal/legal.service");

const repository = require("../src/features/auth/auth.repository");
const service = require("../src/features/auth/auth.service");

const userId = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(async () => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) => callback({ tx: true }));
  repository.findUserByIdWithPassword.mockResolvedValue({
    id: userId,
    status: "ACTIVE",
    passwordHash: await bcrypt.hash("OldPassword1!", 4),
  });
  repository.findRefreshTokenByHash.mockResolvedValue({
    id: "650e8400-e29b-41d4-a716-446655440000",
    userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60000),
  });
  repository.updateUserPassword.mockResolvedValue({});
  repository.revokeOtherRefreshTokensForUser.mockResolvedValue({ count: 2 });
});

test("changes the password and keeps only the current refresh-token session", async () => {
  const result = await service.changePassword(userId, {
    currentPassword: "OldPassword1!",
    newPassword: "NewPassword2!",
    refreshToken: "current-refresh-token",
  });
  expect(result.message).toMatch(/Other sessions/);
  expect(repository.updateUserPassword).toHaveBeenCalledWith(
    userId,
    expect.any(String),
    expect.anything(),
  );
  expect(repository.revokeOtherRefreshTokensForUser).toHaveBeenCalledWith(
    userId,
    "650e8400-e29b-41d4-a716-446655440000",
    expect.anything(),
  );
});

test("rejects an incorrect current password", async () => {
  await expect(
    service.changePassword(userId, {
      currentPassword: "WrongPassword1!",
      newPassword: "NewPassword2!",
      refreshToken: "current-refresh-token",
    }),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(repository.updateUserPassword).not.toHaveBeenCalled();
});
