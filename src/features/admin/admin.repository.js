const prisma = require("../../config/prisma");

const userSelect = {
  id: true,
  fullName: true,
  phone: true,
  profileImageUrl: true,
  verificationStatus: true,
};

const listVerifications = ({ status, skip, take }) =>
  prisma.identityVerification.findMany({
    where: { status },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      user: { select: userSelect },
      reviewedByAdmin: { select: { id: true, fullName: true } },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    skip,
    take,
  });

const countVerifications = (status) =>
  prisma.identityVerification.count({ where: { status } });

const findVerificationById = (id, client = prisma) =>
  client.identityVerification.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      idFrontImagePath: true,
      idBackImagePath: true,
      selfieImagePath: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      user: { select: userSelect },
      reviewedByAdmin: { select: { id: true, fullName: true } },
    },
  });

const runTransaction = (callback) => prisma.$transaction(callback);
const claimPendingVerification = (id, data, client) =>
  client.identityVerification.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data,
  });
const updateUserVerificationStatus = (userId, verificationStatus, client) =>
  client.user.update({
    where: { id: userId },
    data: { verificationStatus },
    select: { id: true, verificationStatus: true },
  });
const createAuditLog = (data, client) => client.adminAuditLog.create({ data });

module.exports = {
  listVerifications,
  countVerifications,
  findVerificationById,
  runTransaction,
  claimPendingVerification,
  updateUserVerificationStatus,
  createAuditLog,
};
