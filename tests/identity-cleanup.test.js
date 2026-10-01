jest.mock("../src/config/prisma", () => ({
  identityDocumentCleanup: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  identityVerification: { updateMany: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("../src/features/users/identityVerification.storage");
const prisma = require("../src/config/prisma");
const storage = require("../src/features/users/identityVerification.storage");
const {
  runIdentityDocumentCleanup,
} = require("../src/jobs/identityDocumentCleanup.job");
const task = {
  id: "task",
  verificationId: "rejected",
  paths: ["front", "back", "selfie"],
  nextAttemptAt: new Date(0),
};
beforeEach(() => {
  jest.resetAllMocks();
  prisma.identityDocumentCleanup.findMany.mockResolvedValue([task]);
  prisma.identityDocumentCleanup.updateMany.mockResolvedValue({ count: 1 });
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  storage.remove.mockResolvedValue();
});
test("deletes all files then marks documents deleted and clears paths without deleting request history", async () => {
  await expect(runIdentityDocumentCleanup()).resolves.toEqual({
    checked: 1,
    deleted: 1,
  });
  expect(storage.remove.mock.calls.map(([path]) => path)).toEqual(task.paths);
  expect(prisma.identityVerification.updateMany).toHaveBeenCalledWith({
    where: { id: "rejected", status: "REJECTED", documentsDeletedAt: null },
    data: {
      idFrontImagePath: null,
      idBackImagePath: null,
      selfieImagePath: null,
      documentsDeletedAt: expect.any(Date),
    },
  });
  expect(prisma.identityDocumentCleanup.deleteMany).toHaveBeenCalledWith({
    where: { id: task.id },
  });
});
test("a partial storage failure retains the task and never reports documents deleted", async () => {
  storage.remove.mockRejectedValueOnce(new Error("offline"));
  await expect(runIdentityDocumentCleanup()).resolves.toEqual({
    checked: 1,
    deleted: 0,
  });
  expect(prisma.identityVerification.updateMany).not.toHaveBeenCalled();
  expect(prisma.identityDocumentCleanup.deleteMany).not.toHaveBeenCalled();
  expect(prisma.identityDocumentCleanup.updateMany).toHaveBeenCalledWith({
    where: { id: task.id, nextAttemptAt: task.nextAttemptAt },
    data: { nextAttemptAt: expect.any(Date), attempts: { increment: 1 } },
  });
  await expect(runIdentityDocumentCleanup()).resolves.toEqual({
    checked: 1,
    deleted: 1,
  });
});
test("losing the lease does not touch documents", async () => {
  prisma.identityDocumentCleanup.updateMany.mockResolvedValue({ count: 0 });
  await runIdentityDocumentCleanup();
  expect(storage.remove).not.toHaveBeenCalled();
});
test("orphan upload cleanup does not modify a verification record", async () => {
  prisma.identityDocumentCleanup.findMany.mockResolvedValue([
    { ...task, verificationId: null },
  ]);
  await runIdentityDocumentCleanup();
  expect(prisma.identityVerification.updateMany).not.toHaveBeenCalled();
  expect(prisma.identityDocumentCleanup.deleteMany).toHaveBeenCalled();
});
test("database failure after storage deletion keeps the task eligible for retry", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  prisma.$transaction.mockRejectedValue(new Error("DB offline"));
  await expect(runIdentityDocumentCleanup()).resolves.toEqual({
    checked: 1,
    deleted: 0,
  });
  expect(prisma.identityDocumentCleanup.deleteMany).not.toHaveBeenCalled();
  console.error.mockRestore();
});
test("empty queue is harmless", async () => {
  prisma.identityDocumentCleanup.findMany.mockResolvedValue([]);
  await expect(runIdentityDocumentCleanup()).resolves.toEqual({
    checked: 0,
    deleted: 0,
  });
});

test("stale orphan task never deletes documents linked to a request", async () => {
  prisma.identityDocumentCleanup.findMany.mockResolvedValue([
    { ...task, verificationId: null },
  ]);
  prisma.identityVerification.findFirst.mockResolvedValue({
    id: "saved",
    status: "PENDING_REVIEW",
  });
  await runIdentityDocumentCleanup();
  expect(storage.remove).not.toHaveBeenCalled();
  expect(prisma.identityDocumentCleanup.deleteMany).toHaveBeenCalledWith({
    where: { id: task.id },
  });
});
test("a stale rejected cleanup task never deletes approved documents", async () => {
  prisma.identityVerification.findFirst.mockResolvedValue({
    id: task.verificationId,
    status: "VERIFIED",
  });
  await runIdentityDocumentCleanup();
  expect(storage.remove).not.toHaveBeenCalled();
});
