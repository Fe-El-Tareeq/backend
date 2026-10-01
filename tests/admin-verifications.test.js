process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

jest.mock("../src/features/admin/admin.repository");
jest.mock("../src/features/users/identityVerification.storage");
jest.mock("../src/features/notifications/notifications.service", () => ({
  templates: {
    identityVerificationApproved: jest.fn(),
    identityVerificationRejected: jest.fn(),
  },
}));

const repository = require("../src/features/admin/admin.repository");
const storage = require("../src/features/users/identityVerification.storage");
const notifications = require("../src/features/notifications/notifications.service");
const service = require("../src/features/admin/admin.service");

const verification = {
  id: "650e8400-e29b-41d4-a716-446655440000",
  userId: "550e8400-e29b-41d4-a716-446655440000",
  status: "PENDING_REVIEW",
  idFrontImagePath: "u/front.jpg",
  idBackImagePath: "u/back.jpg",
  selfieImagePath: "u/selfie.jpg",
};

beforeEach(() => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) =>
    callback({ tx: true }),
  );
  repository.findVerificationById.mockResolvedValue(verification);
  repository.claimPendingVerification.mockResolvedValue({ count: 1 });
  repository.updateUserVerificationStatus.mockResolvedValue({});
  repository.createAuditLog.mockResolvedValue({});
  notifications.templates.identityVerificationApproved.mockResolvedValue({});
  notifications.templates.identityVerificationRejected.mockResolvedValue({});
});

test("only returns signed URLs when an admin opens verification details", async () => {
  storage.createSignedUrl
    .mockResolvedValueOnce("signed-front")
    .mockResolvedValueOnce("signed-back")
    .mockResolvedValueOnce("signed-selfie");
  const result = await service.getVerification(verification.id);
  expect(result.documents.idFrontImageUrl).toBe("signed-front");
  expect(result.idFrontImagePath).toBeUndefined();
});

test("approves a pending verification atomically and notifies the user", async () => {
  const result = await service.approveVerification("admin-id", verification.id);
  expect(result.status).toBe("VERIFIED");
  expect(repository.updateUserVerificationStatus).toHaveBeenCalledWith(
    verification.userId,
    "VERIFIED",
    expect.anything(),
  );
  expect(
    notifications.templates.identityVerificationApproved,
  ).toHaveBeenCalledWith(
    {
      userId: verification.userId,
      verificationId: verification.id,
      rejectionReason: null,
    },
    { tx: true },
  );
});

test("notification failure rejects identity approval within its transaction", async () => {
  notifications.templates.identityVerificationApproved.mockRejectedValue(
    new Error("notification write failed"),
  );

  await expect(
    service.approveVerification("admin-id", verification.id),
  ).rejects.toThrow("notification write failed");
  expect(repository.runTransaction).toHaveBeenCalledTimes(1);
});

test("rejects an already reviewed verification", async () => {
  repository.findVerificationById.mockResolvedValue({
    ...verification,
    status: "VERIFIED",
  });
  await expect(
    service.rejectVerification("admin-id", verification.id, "Unclear image"),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(
    notifications.templates.identityVerificationApproved,
  ).not.toHaveBeenCalled();
  expect(
    notifications.templates.identityVerificationRejected,
  ).not.toHaveBeenCalled();
});

test("rejection queues all documents in the review transaction and keeps its audit trail", async () => {
  const result = await service.rejectVerification(
    "admin-id",
    verification.id,
    "  صورة غير واضحة  ",
  );
  expect(result).toMatchObject({
    status: "REJECTED",
    rejectionReason: "صورة غير واضحة",
    documentsStatus: "PENDING_DELETION",
  });
  expect(repository.enqueueVerificationCleanup).toHaveBeenCalledWith(
    verification,
    { tx: true },
  );
  expect(repository.updateUserVerificationStatus).toHaveBeenCalledWith(
    verification.userId,
    "REJECTED",
    { tx: true },
  );
  expect(
    notifications.templates.identityVerificationRejected,
  ).toHaveBeenCalledWith(
    {
      userId: verification.userId,
      verificationId: verification.id,
      rejectionReason: "صورة غير واضحة",
    },
    { tx: true },
  );
  expect(storage.remove).not.toHaveBeenCalled();
});
test("approval does not queue deletion", async () => {
  await service.approveVerification("admin-id", verification.id);
  expect(repository.enqueueVerificationCleanup).not.toHaveBeenCalled();
});
test("cleanup queue failure rejects the review transaction", async () => {
  repository.enqueueVerificationCleanup.mockRejectedValueOnce(
    new Error("queue unavailable"),
  );
  await expect(
    service.rejectVerification("admin-id", verification.id, "Unclear image"),
  ).rejects.toThrow("queue unavailable");
  expect(
    notifications.templates.identityVerificationRejected,
  ).not.toHaveBeenCalled();
});
test.each([null, "", "  ", "ab", "x".repeat(501)])(
  "requires a valid reason (%s)",
  async (reason) => {
    await expect(
      service.rejectVerification("admin-id", verification.id, reason),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.claimPendingVerification).not.toHaveBeenCalled();
  },
);
test.each([null, new Date()])(
  "rejected detail never exposes image URLs (deletedAt=%s)",
  async (documentsDeletedAt) => {
    repository.findVerificationById.mockResolvedValue({
      ...verification,
      status: "REJECTED",
      documentsDeletedAt,
    });
    const result = await service.getVerification(verification.id);
    expect(result.documents).toBeNull();
    expect(result.documentsStatus).toBe(
      documentsDeletedAt ? "DELETED" : "PENDING_DELETION",
    );
    expect(result.documentCount).toBe(3);
    expect(result.availableDocumentCount).toBe(0);
    expect(result).not.toHaveProperty("idFrontImagePath");
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  },
);
test("dashboard includes search-aware counters independent of the selected status", async () => {
  repository.listVerifications.mockResolvedValue([verification]);
  repository.countVerifications.mockResolvedValue(1);
  repository.verificationStatistics.mockResolvedValue([
    { status: "PENDING_REVIEW", _count: { _all: 1 } },
    { status: "VERIFIED", _count: { _all: 3 } },
    { status: "REJECTED", _count: { _all: 2 } },
  ]);
  const filters = {
    status: "PENDING_REVIEW",
    search: "Farah",
    skip: 0,
    take: 20,
  };
  const result = await service.listVerifications(filters);
  expect(result.statistics).toEqual({
    total: 6,
    PENDING_REVIEW: 1,
    VERIFIED: 3,
    REJECTED: 2,
    UNVERIFIED: 0,
  });
  expect(result.pagination.total).toBe(1);
  expect(repository.countVerifications).toHaveBeenCalledWith(filters);
  expect(repository.verificationStatistics).toHaveBeenCalledWith("Farah");
  expect(result.verifications[0]).not.toHaveProperty("idFrontImagePath");
});
test("a concurrent decision cannot create a second notification or deletion task", async () => {
  repository.claimPendingVerification.mockResolvedValue({ count: 0 });
  await expect(
    service.rejectVerification("admin-id", verification.id, "Unclear image"),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(repository.enqueueVerificationCleanup).not.toHaveBeenCalled();
  expect(
    notifications.templates.identityVerificationRejected,
  ).not.toHaveBeenCalled();
});
