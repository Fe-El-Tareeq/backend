const ERRAND_POST_TOKEN_COST = 1;
const ERRAND_EXPIRES_AFTER_HOURS = 24;
const MAX_VOICE_NOTE_DURATION_SEC = 30;

const WEIGHT_CLASS_FEES_NIS = {
  LIGHT: 5,
  MEDIUM: 8,
  HEAVY: 12,
};

const URGENT_FEE_NIS = 2;
const INTER_ZONE_FEE_NIS = 3;
const URGENT_PRIORITY_BOOST = 10;
const SOON_PRIORITY_BOOST = 3;

const calculateFeeNis = ({ weightClass, isUrgent, isInterZone }) => {
  return (
    WEIGHT_CLASS_FEES_NIS[weightClass] +
    (isUrgent ? URGENT_FEE_NIS : 0) +
    (isInterZone ? INTER_ZONE_FEE_NIS : 0)
  );
};

const calculatePriorityScore = ({ category, isUrgent, neededByTime }) => {
  const categoryWeight = Number(category?.priorityWeight || 1);
  const dueSoon =
    neededByTime &&
    new Date(neededByTime).getTime() <= Date.now() + 6 * 60 * 60 * 1000;

  return (
    categoryWeight +
    (isUrgent ? URGENT_PRIORITY_BOOST : 0) +
    (dueSoon ? SOON_PRIORITY_BOOST : 0)
  );
};

const calculateExpiresAt = (neededByTime) => {
  if (neededByTime) {
    return new Date(neededByTime);
  }

  return new Date(Date.now() + ERRAND_EXPIRES_AFTER_HOURS * 60 * 60 * 1000);
};

module.exports = {
  ERRAND_POST_TOKEN_COST,
  ERRAND_EXPIRES_AFTER_HOURS,
  MAX_VOICE_NOTE_DURATION_SEC,
  calculateFeeNis,
  calculatePriorityScore,
  calculateExpiresAt,
};
