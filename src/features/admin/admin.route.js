const express = require("express");
const controller = require("./admin.controller");
const validation = require("./admin.validation");
const validate = require("../../middleware/validate.middleware");
const {
  requireAdmin,
  requireAuth,
} = require("../../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get(
  "/verifications",
  validate(validation.listVerificationsSchema),
  controller.listVerifications,
);
router.get(
  "/verifications/:id",
  validate(validation.verificationDetailsSchema),
  controller.getVerification,
);
router.post(
  "/verifications/:id/approve",
  validate(validation.approveVerificationSchema),
  controller.approveVerification,
);
router.post(
  "/verifications/:id/reject",
  validate(validation.rejectVerificationSchema),
  controller.rejectVerification,
);
router.get("/faqs", validate(validation.listFaqsSchema), controller.listFaqs);
router.post(
  "/faqs",
  validate(validation.createFaqSchema),
  controller.createFaq,
);
router.patch(
  "/faqs/reorder",
  validate(validation.reorderFaqsSchema),
  controller.reorderFaqs,
);
router.patch(
  "/faqs/:id",
  validate(validation.updateFaqSchema),
  controller.updateFaq,
);
router.delete(
  "/faqs/:id",
  validate(validation.deleteFaqSchema),
  controller.deleteFaq,
);

module.exports = router;
