const prisma = require("../../config/prisma");
const safeUserSelect = {
  id: true,
  fullName: true,
  profileImageUrl: true,
  trustScore: true,
};
const ratingInclude = {
  reviewer: { select: safeUserSelect },
  reviewedUser: { select: safeUserSelect },
  feedbackTags: { select: { tag: true }, orderBy: { tag: "asc" } },
};
const runTransaction = (callback) => prisma.$transaction(callback);
const lockAssignment = (assignmentId, client) =>
  client.$queryRaw`SELECT id FROM errand_assignments WHERE id = ${assignmentId}::uuid FOR UPDATE`;
const lockUser = (userId, client) =>
  client.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
const findAssignmentForRating = async (
  assignmentId,
  client = prisma,
  lock = false,
) => {
  if (lock) await lockAssignment(assignmentId, client);
  return client.errandAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      status: true,
      travelerId: true,
      errand: {
        select: { requesterId: true, requester: { select: safeUserSelect } },
      },
      traveler: { select: safeUserSelect },
    },
  });
};
const findRatingByAssignmentAndReviewer = (
  assignmentId,
  reviewerId,
  client = prisma,
) =>
  client.rating.findUnique({
    where: { assignmentId_reviewerId: { assignmentId, reviewerId } },
    include: ratingInclude,
  });
const createRating = (data, client = prisma) =>
  client.rating.create({
    data: {
      assignmentId: data.assignmentId,
      reviewerId: data.reviewerId,
      reviewedUserId: data.reviewedUserId,
      ratingStars: data.ratingStars,
      comments: data.comments,
      paymentModalityConfirmed: data.paymentModalityConfirmed,
      feedbackTags: data.feedbackTags.length
        ? { create: data.feedbackTags.map((tag) => ({ tag })) }
        : undefined,
    },
    include: ratingInclude,
  });
const aggregateReceivedRatings = (userId, client = prisma) =>
  client.rating.aggregate({
    where: { reviewedUserId: userId },
    _avg: { ratingStars: true },
    _sum: { ratingStars: true },
    _count: { _all: true },
  });
const updateTrustScore = (userId, trustScore, client = prisma) =>
  client.user.update({
    where: { id: userId },
    data: { trustScore },
    select: safeUserSelect,
  });
const listAssignmentRatings = (assignmentId, client = prisma) =>
  client.rating.findMany({
    where: { assignmentId },
    include: ratingInclude,
    orderBy: { createdAt: "asc" },
  });
const pendingWhere = (userId) => ({
  status: "COMPLETED",
  OR: [{ travelerId: userId }, { errand: { requesterId: userId } }],
  ratings: { none: { reviewerId: userId } },
});
const listPending = ({ userId, skip, take }, client = prisma) =>
  client.errandAssignment.findMany({
    where: pendingWhere(userId),
    select: {
      id: true,
      completedAt: true,
      travelerId: true,
      traveler: { select: safeUserSelect },
      errand: {
        select: {
          title: true,
          requesterId: true,
          requester: { select: safeUserSelect },
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    skip,
    take,
  });
const countPending = (userId, client = prisma) =>
  client.errandAssignment.count({ where: pendingWhere(userId) });
const listReceived = ({ userId, skip, take }, client = prisma) =>
  client.rating.findMany({
    where: { reviewedUserId: userId },
    include: ratingInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
const countReceived = (userId, client = prisma) =>
  client.rating.count({ where: { reviewedUserId: userId } });
const findUserSummary = (userId, client = prisma) =>
  client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      trustScore: true,
      userBadges: {
        select: {
          awardedAt: true,
          badge: { select: { name: true, description: true, icon: true } },
        },
        orderBy: { awardedAt: "asc" },
      },
    },
  });
module.exports = {
  runTransaction,
  lockUser,
  findAssignmentForRating,
  findRatingByAssignmentAndReviewer,
  createRating,
  aggregateReceivedRatings,
  updateTrustScore,
  listAssignmentRatings,
  listPending,
  countPending,
  listReceived,
  countReceived,
  findUserSummary,
};
