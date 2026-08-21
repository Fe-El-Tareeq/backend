const express = require("express");

const authController = require("./auth.controller");
const validate = require("../../middleware/validate.middleware");

const {
  registerSchema,
  loginSchema,
  phoneSchema,
  verifyOtpSchema,
  refreshTokenSchema,
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

module.exports = router;
