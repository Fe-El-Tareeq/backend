const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./proposals.controller");
const validation = require("./proposals.validation");

const router = express.Router();
router.get(
  "/errands/:id/proposals",
  requireAuth,
  validate(validation.listErrandProposalsSchema),
  controller.listErrandProposals,
);
router.get(
  "/trips/:id/proposals",
  requireAuth,
  validate(validation.listTripProposalsSchema),
  controller.listTripProposals,
);

module.exports = router;
