const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./assignments.controller");
const {
  assignmentIdSchema,
  createAssignmentSchema,
  listAssignmentsSchema,
  cancelAssignmentSchema,
} = require("./assignments.validation");

const router = express.Router();

router.use(requireAuth);

router.post("/", validate(createAssignmentSchema), controller.createAssignment);
router.get("/", validate(listAssignmentsSchema), controller.listAssignments);
router.get("/:id", validate(assignmentIdSchema), controller.getAssignmentById);
router.post("/:id/pickup", validate(assignmentIdSchema), controller.markPickedUp);
router.post("/:id/start-delivery", validate(assignmentIdSchema), controller.startDelivery);
router.post("/:id/complete", validate(assignmentIdSchema), controller.completeAssignment);
router.post("/:id/cancel", validate(cancelAssignmentSchema), controller.cancelAssignment);

module.exports = router;
