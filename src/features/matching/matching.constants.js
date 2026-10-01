const DEFAULT_MATCH_LIMIT = 10;
const MAX_MATCH_LIMIT = 20;
const WEIGHT_CLASS_UNITS = Object.freeze({ LIGHT: 1, MEDIUM: 2, HEAVY: 3 });
const SCORE_WEIGHTS = Object.freeze({ destination: 40, time: 30, load: 15, urgency: 10, maximumPositive: 95, maximumTrustPenalty: 10 });
const TRUST_BASELINE = 70;
const TIME_SCORE_WINDOW_HOURS = 24;

module.exports = { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT, WEIGHT_CLASS_UNITS, SCORE_WEIGHTS, TRUST_BASELINE, TIME_SCORE_WINDOW_HOURS };
