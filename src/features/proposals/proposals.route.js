const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./proposals.controller");
const validation = require("./proposals.validation");

const router = express.Router();
router.use(requireAuth);
router.post(
  "/",
  validate(validation.createProposalSchema),
  controller.createProposal,
);
router.post(
  "/:id/accept",
  validate(validation.proposalActionSchema),
  controller.acceptProposal,
);
router.post(
  "/:id/reject",
  validate(validation.proposalActionSchema),
  controller.rejectProposal,
);

module.exports = router;
