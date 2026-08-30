const repository = require("./badges.repository");
const { BADGE_NAMES } = require("./badges.constants");
const eligibleBadgeNames = ({
  completedDeliveries,
  ratingCount,
  averageRating,
  trustScore,
}) => {
  const names = [];
  if (completedDeliveries >= 1) names.push(BADGE_NAMES.FIRST_DELIVERY);
  if (completedDeliveries >= 5) names.push(BADGE_NAMES.HELPFUL_NEIGHBOR);
  if (ratingCount >= 5 && trustScore >= 80)
    names.push(BADGE_NAMES.TRUSTED_TRAVELER);
  if (ratingCount >= 10 && averageRating >= 4.5 && trustScore >= 90)
    names.push(BADGE_NAMES.TOP_RATED);
  return names;
};
const evaluateAndAward = async (userId, client) => {
  const names = eligibleBadgeNames(await repository.getMetrics(userId, client));
  const badges = await repository.findActiveByNames(names, client);
  await repository.awardMany(
    userId,
    badges.map(({ id }) => id),
    client,
  );
  return badges;
};
module.exports = { eligibleBadgeNames, evaluateAndAward };
