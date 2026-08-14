const express = require("express");

const controller = require("./users.controller");
const validate = require("../../middleware/validate.middleware");
const { requireAuth } = require("../../middleware/auth.middleware");
const { updateProfileSchema } = require("./users.validation");

const router = express.Router();

// Returns the authenticated user's profile.
router.get("/me", requireAuth, controller.getCurrentUserProfile);

// Updates the authenticated user's profile.
router.patch(
  "/me",
  requireAuth,
  validate(updateProfileSchema),
  controller.updateCurrentUserProfile,
);

module.exports = router;
