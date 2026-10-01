const bcrypt = require("bcryptjs");
jest.mock("../src/features/legal/legal.repository");
jest.mock("../src/features/users/users.repository");
const legalRepo = require("../src/features/legal/legal.repository");
const userRepo = require("../src/features/users/users.repository");
const legal = require("../src/features/legal/legal.service");
const users = require("../src/features/users/users.service");
const userId = "550e8400-e29b-41d4-a716-446655440001";
beforeEach(() => {
  jest.clearAllMocks();
  process.env.TERMS_VERSION = "1.0.0";
  process.env.PRIVACY_VERSION = "1.0.0";
  userRepo.runTransaction.mockImplementation((cb) => cb({ tx: true }));
});
test("records current legal versions idempotently", async () => {
  legalRepo.find.mockResolvedValue(null);
  legalRepo.create.mockResolvedValue({
    userId,
    termsVersion: "1.0.0",
    privacyVersion: "1.0.0",
  });
  const x = await legal.accept(userId, {
    termsVersion: "1.0.0",
    privacyVersion: "1.0.0",
  });
  expect(x.created).toBe(true);
});
test("rejects stale legal versions", async () => {
  await expect(
    legal.accept(userId, { termsVersion: "0.9", privacyVersion: "1.0.0" }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
test("deactivation verifies password, checks blockers, revokes sessions and deactivates", async () => {
  const hash = await bcrypt.hash("Strong1!", 4);
  userRepo.findCredentials.mockResolvedValue({
    id: userId,
    passwordHash: hash,
  });
  userRepo.accountDeletionBlockers.mockResolvedValue({
    assignments: 0,
    errands: 0,
    trips: 0,
  });
  userRepo.revokeSessions.mockResolvedValue({ count: 2 });
  userRepo.deactivateAccount.mockResolvedValue({
    id: userId,
    status: "DEACTIVATED",
  });
  const x = await users.deactivateCurrentUserAccount(userId, {
    password: "Strong1!",
  });
  expect(x.status).toBe("DEACTIVATED");
  expect(userRepo.revokeSessions).toHaveBeenCalled();
  expect(userRepo.deactivateAccount).toHaveBeenCalledWith(
    userId,
    expect.any(Date),
    expect.any(Date),
    expect.anything(),
  );
  const [, requestedAt, scheduledAt] = userRepo.deactivateAccount.mock.calls[0];
  expect(scheduledAt.getTime() - requestedAt.getTime()).toBe(30 * 86400000);
});
test("active operations block deactivation", async () => {
  const hash = await bcrypt.hash("Strong1!", 4);
  userRepo.findCredentials.mockResolvedValue({
    id: userId,
    passwordHash: hash,
  });
  userRepo.accountDeletionBlockers.mockResolvedValue({
    assignments: 1,
    errands: 0,
    trips: 0,
  });
  await expect(
    users.deactivateCurrentUserAccount(userId, { password: "Strong1!" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(userRepo.revokeSessions).not.toHaveBeenCalled();
});
