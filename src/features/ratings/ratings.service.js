const ApiError = require("../../utils/ApiError");
const badgeService = require("../badges/badges.service");
const repository = require("./ratings.repository");
const {
  TRUST_PRIOR_SCORE,
  TRUST_PRIOR_WEIGHT,
} = require("./ratings.constants");

const calculateTrustScore = ({ ratingCount, ratingStarsSum }) => {
  const score =
    (TRUST_PRIOR_SCORE * TRUST_PRIOR_WEIGHT + ratingStarsSum * 20) /
    (TRUST_PRIOR_WEIGHT + ratingCount);
  return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
};

const counterpartFor = (assignment, reviewerId) => {
  if (assignment.travelerId === reviewerId)
    return {
      id: assignment.errand.requesterId,
      user: assignment.errand.requester,
      role: "REQUESTER",
    };
  if (assignment.errand.requesterId === reviewerId)
    return {
      id: assignment.travelerId,
      user: assignment.traveler,
      role: "TRAVELER",
    };
  throw new ApiError(403, "Only assignment participants can submit a rating.");
};
const normalizedTags = (rating) =>
  rating.feedbackTags.map(({ tag }) => tag).sort();
const samePayload = (rating, input, reviewedUserId) => {
  const tags = [...input.feedbackTags].sort();
  return (
    rating.reviewedUserId === reviewedUserId &&
    rating.ratingStars === input.ratingStars &&
    (rating.comments || null) === (input.comments || null) &&
    (rating.paymentModalityConfirmed || null) ===
      (input.paymentModalityConfirmed || null) &&
    JSON.stringify(normalizedTags(rating)) === JSON.stringify(tags)
  );
};

const createRating = (reviewerId, input) =>
  repository.runTransaction(async (tx) => {
    const assignment = await repository.findAssignmentForRating(
      input.assignmentId,
      tx,
      true,
    );
    if (!assignment) throw new ApiError(404, "Assignment not found.");
    if (assignment.status !== "COMPLETED")
      throw new ApiError(
        409,
        "Ratings are allowed only after assignment completion.",
      );
    const counterpart = counterpartFor(assignment, reviewerId);
    const existing = await repository.findRatingByAssignmentAndReviewer(
      input.assignmentId,
      reviewerId,
      tx,
    );
    if (existing) {
      if (samePayload(existing, input, counterpart.id))
        return { rating: existing, created: false };
      throw new ApiError(409, "You have already rated this assignment.");
    }
    await repository.lockUser(counterpart.id, tx);
    const rating = await repository.createRating(
      {
        ...input,
        reviewerId,
        reviewedUserId: counterpart.id,
        comments: input.comments || null,
        paymentModalityConfirmed: input.paymentModalityConfirmed || null,
      },
      tx,
    );
    const aggregate = await repository.aggregateReceivedRatings(
      counterpart.id,
      tx,
    );
    const trustScore = calculateTrustScore({
      ratingCount: aggregate._count._all,
      ratingStarsSum: aggregate._sum.ratingStars || 0,
    });
    await repository.updateTrustScore(counterpart.id, trustScore, tx);
    await badgeService.evaluateAndAward(counterpart.id, tx);
    return { rating, created: true, trustScore };
  });

const getAssignmentRatings = async (userId, assignmentId) => {
  const assignment = await repository.findAssignmentForRating(assignmentId);
  if (!assignment) throw new ApiError(404, "Assignment not found.");
  counterpartFor(assignment, userId);
  return { ratings: await repository.listAssignmentRatings(assignmentId) };
};
const getPending = async (userId, { skip, take }) => {
  const [rows, total] = await Promise.all([
    repository.listPending({ userId, skip, take }),
    repository.countPending(userId),
  ]);
  const pendingRatings = rows.map((assignment) => {
    const counterpart = counterpartFor(assignment, userId);
    return {
      assignmentId: assignment.id,
      completedAt: assignment.completedAt,
      errandTitle: assignment.errand.title,
      reviewedUser: counterpart.user,
      reviewedRole: counterpart.role,
    };
  });
  return { pendingRatings, pagination: { skip, take, total } };
};
const getReceived = async (userId, { skip, take }) => {
  const [ratings, total] = await Promise.all([
    repository.listReceived({ userId, skip, take }),
    repository.countReceived(userId),
  ]);
  return { ratings, pagination: { skip, take, total } };
};
const getSummary = async (userId) => {
  const [user, aggregate] = await Promise.all([
    repository.findUserSummary(userId),
    repository.aggregateReceivedRatings(userId),
  ]);
  return {
    user,
    ratingCount: aggregate._count._all,
    averageRating:
      aggregate._avg.ratingStars === null
        ? null
        : Math.round(aggregate._avg.ratingStars * 100) / 100,
  };
};

module.exports = {
  calculateTrustScore,
  counterpartFor,
  createRating,
  getAssignmentRatings,
  getPending,
  getReceived,
  getSummary,
};
