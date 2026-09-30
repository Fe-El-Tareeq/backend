const ApiError = require("../../utils/ApiError");
const repository = require("./admin.repository");
const identityStorage = require("../users/identityVerification.storage");
const notificationsService = require("../notifications/notifications.service");

const publicVerification = ({
  idFrontImagePath,
  idBackImagePath,
  selfieImagePath,
  ...value
}) => ({
  ...value,
  documentCount: 3,
  availableDocumentCount:
    value.status === "REJECTED" || value.documentsDeletedAt ? 0 : 3,
  documentsStatus: value.documentsDeletedAt
    ? "DELETED"
    : value.status === "REJECTED"
      ? "PENDING_DELETION"
      : "AVAILABLE",
  documentsDeletedAt: value.documentsDeletedAt || null,
});

const listVerifications = async (filters) => {
  const [verifications, total, groups] = await Promise.all([
    repository.listVerifications(filters),
    repository.countVerifications(filters),
    repository.verificationStatistics(filters.search),
  ]);
  return {
    verifications: verifications.map(publicVerification),
    statistics: groups.reduce(
      (counts, group) => {
        counts[group.status] = group._count._all;
        counts.total += group._count._all;
        return counts;
      },
      { total: 0, PENDING_REVIEW: 0, VERIFIED: 0, REJECTED: 0, UNVERIFIED: 0 },
    ),
    pagination: { skip: filters.skip, take: filters.take, total },
  };
};

const getVerification = async (id) => {
  const verification = await repository.findVerificationById(id);
  if (!verification)
    throw new ApiError(404, "Identity verification not found.");
  if (verification.status === "REJECTED" || verification.documentsDeletedAt) {
    return { ...publicVerification(verification), documents: null };
  }
  const [idFrontImageUrl, idBackImageUrl, selfieImageUrl] = await Promise.all([
    identityStorage.createSignedUrl(verification.idFrontImagePath),
    identityStorage.createSignedUrl(verification.idBackImagePath),
    identityStorage.createSignedUrl(verification.selfieImagePath),
  ]);
  return {
    ...publicVerification(verification),
    documents: {
      idFrontImageUrl,
      idBackImageUrl,
      selfieImageUrl,
      expiresInSeconds: 300,
    },
  };
};

const reviewVerification = async (
  adminId,
  id,
  status,
  rejectionReason = null,
) =>
  repository.runTransaction(async (tx) => {
    const verification = await repository.findVerificationById(id, tx);
    if (!verification)
      throw new ApiError(404, "Identity verification not found.");
    if (verification.status !== "PENDING_REVIEW") {
      throw new ApiError(
        409,
        "Identity verification has already been reviewed.",
      );
    }
    if (
      status === "REJECTED" &&
      (typeof rejectionReason !== "string" ||
        rejectionReason.trim().length < 3 ||
        rejectionReason.trim().length > 500)
    ) {
      throw new ApiError(
        400,
        "A rejection reason of 3 to 500 characters is required.",
      );
    }
    if (rejectionReason) rejectionReason = rejectionReason.trim();
    const reviewedAt = new Date();
    const claim = await repository.claimPendingVerification(
      id,
      { status, rejectionReason, reviewedAt, reviewedByAdminId: adminId },
      tx,
    );
    if (claim.count !== 1) {
      throw new ApiError(
        409,
        "Identity verification has already been reviewed.",
      );
    }
    if (status === "REJECTED")
      await repository.enqueueVerificationCleanup(verification, tx);
    await repository.updateUserVerificationStatus(
      verification.userId,
      status,
      tx,
    );
    await repository.createAuditLog(
      {
        adminId,
        targetUserId: verification.userId,
        action:
          status === "VERIFIED"
            ? "IDENTITY_VERIFICATION_APPROVED"
            : "IDENTITY_VERIFICATION_REJECTED",
        entityType: "IdentityVerification",
        entityId: id,
        oldValues: { status: "PENDING_REVIEW" },
        newValues: { status, rejectionReason },
        notes: rejectionReason,
      },
      tx,
    );
    const template =
      status === "VERIFIED"
        ? notificationsService.templates.identityVerificationApproved
        : notificationsService.templates.identityVerificationRejected;
    await template(
      { userId: verification.userId, verificationId: id, rejectionReason },
      tx,
    );
    return {
      id,
      userId: verification.userId,
      status,
      rejectionReason,
      reviewedAt,
      documentCount: 3,
      documentsStatus: status === "REJECTED" ? "PENDING_DELETION" : "AVAILABLE",
      documentsDeletedAt: null,
    };
  });

const approveVerification = (adminId, id) =>
  reviewVerification(adminId, id, "VERIFIED");
const rejectVerification = (adminId, id, reason) =>
  reviewVerification(adminId, id, "REJECTED", reason);

const listFaqs = async (filters) => {
  const [faqs, total] = await Promise.all([
    repository.listFaqs(filters),
    repository.countFaqs(filters.isActive),
  ]);
  return {
    faqs,
    pagination: { skip: filters.skip, take: filters.take, total },
  };
};

const createFaq = (adminId, payload) =>
  repository.runTransaction(async (tx) => {
    const faq = await repository.createFaq(payload, tx);
    await repository.createAuditLog(
      {
        adminId,
        action: "FAQ_CREATED",
        entityType: "Faq",
        entityId: faq.id,
        newValues: faq,
      },
      tx,
    );
    return faq;
  });

const updateFaq = (adminId, id, payload) =>
  repository.runTransaction(async (tx) => {
    const existing = await repository.findFaqById(id, tx);
    if (!existing) throw new ApiError(404, "FAQ not found.");
    const faq = await repository.updateFaq(id, payload, tx);
    await repository.createAuditLog(
      {
        adminId,
        action: "FAQ_UPDATED",
        entityType: "Faq",
        entityId: id,
        oldValues: existing,
        newValues: faq,
      },
      tx,
    );
    return faq;
  });

const deleteFaq = (adminId, id) =>
  repository.runTransaction(async (tx) => {
    const existing = await repository.findFaqById(id, tx);
    if (!existing) throw new ApiError(404, "FAQ not found.");
    const faq = await repository.updateFaq(id, { isActive: false }, tx);
    await repository.createAuditLog(
      {
        adminId,
        action: "FAQ_DEACTIVATED",
        entityType: "Faq",
        entityId: id,
        oldValues: existing,
        newValues: faq,
      },
      tx,
    );
    return faq;
  });

const reorderFaqs = (adminId, items) =>
  repository.runTransaction(async (tx) => {
    const existing = await Promise.all(
      items.map((item) => repository.findFaqById(item.id, tx)),
    );
    if (existing.some((faq) => !faq)) throw new ApiError(404, "FAQ not found.");
    const faqs = [];
    for (const item of items) {
      faqs.push(
        await repository.updateFaq(
          item.id,
          { displayOrder: item.displayOrder },
          tx,
        ),
      );
    }
    await repository.createAuditLog(
      {
        adminId,
        action: "FAQS_REORDERED",
        entityType: "Faq",
        newValues: { items },
      },
      tx,
    );
    return faqs;
  });

module.exports = {
  listVerifications,
  getVerification,
  approveVerification,
  rejectVerification,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
};
