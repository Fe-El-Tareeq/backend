const prisma = require("../../config/prisma");
const getMetrics = async (userId, client = prisma) => {
  const [completedDeliveries, ratings, user] = await Promise.all([
    client.errandAssignment.count({
      where: { travelerId: userId, status: "COMPLETED" },
    }),
    client.rating.aggregate({
      where: { reviewedUserId: userId },
      _avg: { ratingStars: true },
      _count: { _all: true },
    }),
    client.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    }),
  ]);
  return {
    completedDeliveries,
    ratingCount: ratings._count._all,
    averageRating: ratings._avg.ratingStars || 0,
    trustScore: Number(user?.trustScore || 0),
  };
};
const findActiveByNames = (names, client = prisma) =>
  client.badge.findMany({
    where: { name: { in: names }, isActive: true },
    select: { id: true, name: true },
  });
const awardMany = (userId, badgeIds, client = prisma) =>
  badgeIds.length
    ? client.userBadge.createMany({
        data: badgeIds.map((badgeId) => ({ userId, badgeId })),
        skipDuplicates: true,
      })
    : { count: 0 };
module.exports = { getMetrics, findActiveByNames, awardMany };
