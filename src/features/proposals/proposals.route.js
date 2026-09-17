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
router.get(
  "/inbox",
  validate(validation.listProposalsSchema),
  controller.listInbox,
);
router.get(
  "/sent",
  validate(validation.listProposalsSchema),
  controller.listSent,
);
router.post(
  "/:id/read",
  validate(validation.proposalActionSchema),
  controller.markProposalRead,
);
router.post(
  "/:id/withdraw",
  validate(validation.proposalActionSchema),
  controller.withdrawProposal,
);
router.post(
  "/:id/accept",
  validate(validation.proposalActionSchema),
  controller.acceptProposal,
);
router.post(
  "/:id/reject",
  validate(validation.rejectProposalSchema),
  controller.rejectProposal,
);

module.exports = router;
