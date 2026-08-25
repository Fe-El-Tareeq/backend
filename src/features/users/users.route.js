const express = require("express");

const controller = require("./users.controller");
const validate = require("../../middleware/validate.middleware");
const { requireAuth } = require("../../middleware/auth.middleware");
const { updateProfileSchema } = require("./users.validation");
const { uploadProfileImage } = require("./profileImage.middleware");

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

router.put("/me/profile-image", requireAuth, uploadProfileImage, controller.updateCurrentUserProfileImage);
router.delete("/me/profile-image", requireAuth, controller.deleteCurrentUserProfileImage);

module.exports = router;
