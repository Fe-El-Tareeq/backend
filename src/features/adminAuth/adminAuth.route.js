const express = require("express");

const { loginSchema, refreshTokenSchema } = require("../auth/auth.validation");
const { requireAdmin, requireAuth } = require("../../middleware/auth.middleware");
const { createRateLimiter } = require("../../middleware/rateLimit.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./adminAuth.controller");

const router = express.Router();

const adminLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
});

router.post(
  "/login",
  validate(loginSchema),
  adminLoginRateLimiter,
  controller.login,
);
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  controller.refresh,
);
router.post(
  "/logout",
  validate(refreshTokenSchema),
  controller.logout,
);
router.get("/me", requireAuth, requireAdmin, controller.me);

module.exports = router;
