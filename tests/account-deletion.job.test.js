process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

jest.mock("../src/config/prisma", () => ({
  user: { findMany: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("../src/features/users/profileImage.storage", () => ({
  remove: jest.fn(),
}));

const prisma = require("../src/config/prisma");
const storage = require("../src/features/users/profileImage.storage");
const job = require("../src/jobs/accountDeletion.job");

beforeEach(() => {
  jest.clearAllMocks();
});

test("permanently deletes a due account and its stored profile image", async () => {
  const deleted = { id: "550e8400-e29b-41d4-a716-446655440001" };
  const tx = { user: { delete: jest.fn().mockResolvedValue(deleted) } };
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  storage.remove.mockResolvedValue();

  await expect(
    job.permanentlyDeleteAccount({
      ...deleted,
      profileImagePath: "user/image.jpg",
    }),
  ).resolves.toEqual(deleted);
  expect(storage.remove).toHaveBeenCalledWith("user/image.jpg");
  expect(tx.user.delete).toHaveBeenCalledWith({
    where: { id: deleted.id },
    select: { id: true },
  });
});

test("cleanup selects only due deactivated accounts", async () => {
  prisma.user.findMany.mockResolvedValue([]);

  await expect(job.runAccountDeletionCleanup()).resolves.toEqual({
    checked: 0,
    erased: 0,
  });
  expect(prisma.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: "DEACTIVATED",
        deletionScheduledAt: { lte: expect.any(Date) },
      }),
    }),
  );
});
