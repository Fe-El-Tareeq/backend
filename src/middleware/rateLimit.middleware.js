const { rateLimit } = require("express-rate-limit");

const createRateLimiter = (options = {}) => {
  const {
    windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit = Number(process.env.RATE_LIMIT_MAX) || 100,
    handler,
    ...overrides
  } = options;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...overrides,
    handler:
      handler ||
      ((req, res) => {
        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again later.",
          errors: [],
        });
      }),
  });
};

const apiRateLimiter = createRateLimiter();

module.exports = {
  apiRateLimiter,
  createRateLimiter,
};
