const ApiError = require("../../utils/ApiError");
const repository = require("./admin.repository");
const identityStorage = require("../users/identityVerification.storage");
const notificationsService = require("../notifications/notifications.service");

const publicVerification = ({ idFrontImagePath, idBackImagePath, selfieImagePath, ...value }) => value;

const listVerifications = async (filters) => {
  const [verifications, total] = await Promise.all([
    repository.listVerifications(filters),
    repository.countVerifications(filters.status),
  ]);
  return { verifications, pagination: { skip: filters.skip, take: filters.take, total } };
};

const getVerification = async (id) => {
  const verification = await repository.findVerificationById(id);
  if (!verification) throw new ApiError(404, "Identity verification not found.");
  const [idFrontImageUrl, idBackImageUrl, selfieImageUrl] = await Promise.all([
    identityStorage.createSignedUrl(verification.idFrontImagePath),
    identityStorage.createSignedUrl(verification.idBackImagePath),
    identityStorage.createSignedUrl(verification.selfieImagePath),
  ]);
  return {
    ...publicVerification(verification),
    documents: { idFrontImageUrl, idBackImageUrl, selfieImageUrl, expiresInSeconds: 300 },
  };
};

const reviewVerification = async (adminId, id, status, rejectionReason = null) =>
  repository.runTransaction(async (tx) => {
    const verification = await repository.findVerificationById(id, tx);
    if (!verification) throw new ApiError(404, "Identity verification not found.");
    if (verification.status !== "PENDING_REVIEW") {
      throw new ApiError(409, "Identity verification has already been reviewed.");
    }
    const reviewedAt = new Date();
    const claim = await repository.claimPendingVerification(
      id,
      { status, rejectionReason, reviewedAt, reviewedByAdminId: adminId },
      tx,
    );
    if (claim.count !== 1) {
      throw new ApiError(409, "Identity verification has already been reviewed.");
    }
    await repository.updateUserVerificationStatus(verification.userId, status, tx);
    await repository.createAuditLog(
      {
        adminId,
        targetUserId: verification.userId,
        action: status === "VERIFIED" ? "IDENTITY_VERIFICATION_APPROVED" : "IDENTITY_VERIFICATION_REJECTED",
        entityType: "IdentityVerification",
        entityId: id,
        oldValues: { status: "PENDING_REVIEW" },
        newValues: { status, rejectionReason },
        notes: rejectionReason,
      },
      tx,
    );
    const template = status === "VERIFIED"
      ? notificationsService.templates.identityVerificationApproved
      : notificationsService.templates.identityVerificationRejected;
    await template({ userId: verification.userId, verificationId: id, rejectionReason }, tx);
    return { id, userId: verification.userId, status, rejectionReason, reviewedAt };
  });

const approveVerification = (adminId, id) => reviewVerification(adminId, id, "VERIFIED");
const rejectVerification = (adminId, id, reason) => reviewVerification(adminId, id, "REJECTED", reason);

module.exports = { listVerifications, getVerification, approveVerification, rejectVerification };
