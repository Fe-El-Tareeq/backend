jest.mock("../src/config/prisma", () => ({
  identityVerification: {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  identityDocumentCleanup: { create: jest.fn(), deleteMany: jest.fn() },
  user: { update: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
}));
const prisma = require("../src/config/prisma");
const admin = require("../src/features/admin/admin.repository");
const users = require("../src/features/users/users.repository");
beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
});
test("search and status scope rows and pagination counts identically", async () => {
  const filters = { status: "REJECTED", search: "0599", skip: 2, take: 5 };
  await admin.listVerifications(filters);
  await admin.countVerifications(filters);
  const where = {
    status: "REJECTED",
    user: {
      is: {
        OR: [
          { fullName: { contains: "0599", mode: "insensitive" } },
          { phone: { contains: "0599" } },
        ],
      },
    },
  };
  expect(prisma.identityVerification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where, skip: 2, take: 5 }),
  );
  expect(prisma.identityVerification.count).toHaveBeenCalledWith({ where });
});
test("ALL omits status and counters ignore selected status", async () => {
  await admin.listVerifications({ status: "ALL", skip: 0, take: 20 });
  expect(prisma.identityVerification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: {} }),
  );
  await admin.verificationStatistics();
  expect(prisma.identityVerification.groupBy).toHaveBeenCalledWith({
    by: ["status"],
    where: {},
    _count: { _all: true },
  });
});
test("submission locks the user and removes only its reservation in the same transaction", async () => {
  prisma.$queryRaw.mockResolvedValue([{ verification_status: "UNVERIFIED" }]);
  prisma.identityVerification.findFirst.mockResolvedValue(null);
  prisma.identityVerification.create.mockResolvedValue({ id: "new" });
  await users.submitIdentityVerification(
    "user",
    { idFrontImagePath: "a", idBackImagePath: "b", selfieImagePath: "c" },
    "reservation",
  );
  expect(prisma.$queryRaw).toHaveBeenCalled();
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: "user" },
    data: { verificationStatus: "PENDING_REVIEW" },
  });
  expect(prisma.identityDocumentCleanup.deleteMany).toHaveBeenCalledWith({
    where: { id: "reservation" },
  });
});
test.each(["VERIFIED", "PENDING_REVIEW"])(
  "rechecks %s after the lock",
  async (status) => {
    prisma.$queryRaw.mockResolvedValue([{ verification_status: status }]);
    prisma.identityVerification.findFirst.mockResolvedValue({ id: "pending" });
    await expect(
      users.submitIdentityVerification("user", {}, "reservation"),
    ).resolves.toHaveProperty("conflict");
    expect(prisma.identityVerification.create).not.toHaveBeenCalled();
    expect(prisma.identityDocumentCleanup.deleteMany).not.toHaveBeenCalled();
  },
);
test("cannot accidentally clear the cleanup queue without a reservation ID", async () => {
  await expect(users.submitIdentityVerification("user", {})).rejects.toThrow(
    "reservation is required",
  );
  expect(prisma.identityDocumentCleanup.deleteMany).not.toHaveBeenCalled();
});
