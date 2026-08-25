const express = require("express");

const authController = require("./auth.controller");
const validate = require("../../middleware/validate.middleware");

const {
  registerSchema,
  loginSchema,
  phoneSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("./auth.validation");

const router = express.Router();

router.post(
  "/register",
  validate(registerSchema),
  authController.register
);

router.post(
  "/login",
  validate(loginSchema),
  authController.login
);

router.post(
  "/request-otp",
  validate(phoneSchema),
  authController.requestOtp
);

router.post(
  "/verify-otp",
  validate(verifyOtpSchema),
  authController.verifyOtp
);

router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refresh
);

router.post(
  "/logout",
  validate(refreshTokenSchema),
  authController.logout
);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authController.resetPassword,
);

module.exports = router;
