process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

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
  repository.runTransaction.mockImplementation((callback) => callback({ tx: true }));
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
  expect(notifications.templates.identityVerificationApproved).toHaveBeenCalledWith(
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
  expect(notifications.templates.identityVerificationApproved).not.toHaveBeenCalled();
  expect(notifications.templates.identityVerificationRejected).not.toHaveBeenCalled();
});
