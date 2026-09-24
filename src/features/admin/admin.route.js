const express = require("express");
const controller = require("./admin.controller");
const validation = require("./admin.validation");
const validate = require("../../middleware/validate.middleware");
const authMiddleware = require("../../middleware/auth.middleware");

const { requireAuth } = authMiddleware;
const requireSuperAdmin =
  authMiddleware.requireSuperAdmin ||
  ((req, res, next) => {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Super admin access is required",
      });
    }

    return next();
  });

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);
router.get("/verifications", validate(validation.listVerificationsSchema), controller.listVerifications);
router.get("/verifications/:id", validate(validation.verificationDetailsSchema), controller.getVerification);
router.post("/verifications/:id/approve", validate(validation.approveVerificationSchema), controller.approveVerification);
router.post("/verifications/:id/reject", validate(validation.rejectVerificationSchema), controller.rejectVerification);

module.exports = router;
