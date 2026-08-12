const { rateLimit } = require("express-rate-limit");

const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs:
      options.windowMs ||
      Number(process.env.RATE_LIMIT_WINDOW_MS) ||
      15 * 60 * 1000,

    limit: options.limit || Number(process.env.RATE_LIMIT_MAX) || 100,

    standardHeaders: "draft-7",
    legacyHeaders: false,

    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        errors: [],
      });
    },
  });
};

const apiRateLimiter = createRateLimiter();

module.exports = {
  apiRateLimiter,
  createRateLimiter,
};
