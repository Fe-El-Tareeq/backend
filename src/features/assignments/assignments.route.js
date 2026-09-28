const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./assignments.controller");
const {
  assignmentIdSchema,
  startDeliverySchema,
  updateEstimatedDeliveryTimeSchema,
  listAssignmentsSchema,
  cancelAssignmentSchema,
} = require("./assignments.validation");

const router = express.Router();

router.use(requireAuth);

router.get("/", validate(listAssignmentsSchema), controller.listAssignments);
router.get("/:id", validate(assignmentIdSchema), controller.getAssignmentById);
router.post(
  "/:id/pickup",
  validate(assignmentIdSchema),
  controller.markPickedUp,
);
router.post(
  "/:id/start-delivery",
  validate(startDeliverySchema),
  controller.startDelivery,
);
router.patch(
  "/:id/estimated-delivery-time",
  validate(updateEstimatedDeliveryTimeSchema),
  controller.updateEstimatedDeliveryTime,
);
router.post(
  "/:id/complete",
  validate(assignmentIdSchema),
  controller.completeAssignment,
);
router.post(
  "/:id/cancel",
  validate(cancelAssignmentSchema),
  controller.cancelAssignment,
);

module.exports = router;
