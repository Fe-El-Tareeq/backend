const prisma = require("../../config/prisma");

const userSelect = {
  id: true,
  fullName: true,
  phone: true,
  profileImageUrl: true,
  verificationStatus: true,
};

const verificationWhere = ({ status, search } = {}) => ({
  ...(status && status !== "ALL" ? { status } : {}),
  ...(search
    ? {
        user: {
          is: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          },
        },
      }
    : {}),
});
const verificationStatistics = (search) =>
  prisma.identityVerification.groupBy({
    by: ["status"],
    where: verificationWhere({ search }),
    _count: { _all: true },
  });
const enqueueVerificationCleanup = (verification, client) =>
  client.identityDocumentCleanup.create({
    data: {
      verificationId: verification.id,
      paths: [
        verification.idFrontImagePath,
        verification.idBackImagePath,
        verification.selfieImagePath,
      ].filter(Boolean),
    },
  });
const listVerifications = ({ status, search, skip, take }) =>
  prisma.identityVerification.findMany({
    where: verificationWhere({ status, search }),
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      documentsDeletedAt: true,
      user: { select: userSelect },
      reviewedByAdmin: { select: { id: true, fullName: true } },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    skip,
    take,
  });

const countVerifications = (filters) =>
  prisma.identityVerification.count({ where: verificationWhere(filters) });

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
      documentsDeletedAt: true,
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

const listFaqs = ({ isActive, skip, take }, client = prisma) =>
  client.faq.findMany({
    where: isActive === undefined ? {} : { isActive },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    skip,
    take,
  });
const countFaqs = (isActive, client = prisma) =>
  client.faq.count({ where: isActive === undefined ? {} : { isActive } });
const findFaqById = (id, client = prisma) =>
  client.faq.findUnique({ where: { id } });
const createFaq = (data, client = prisma) => client.faq.create({ data });
const updateFaq = (id, data, client = prisma) =>
  client.faq.update({ where: { id }, data });

module.exports = {
  verificationStatistics,
  enqueueVerificationCleanup,
  listVerifications,
  countVerifications,
  findVerificationById,
  runTransaction,
  claimPendingVerification,
  updateUserVerificationStatus,
  createAuditLog,
  listFaqs,
  countFaqs,
  findFaqById,
  createFaq,
  updateFaq,
};
