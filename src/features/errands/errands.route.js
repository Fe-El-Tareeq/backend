const express = require("express");

const validate = require("../../middleware/validate.middleware");
const authMiddleware = require("../../middleware/auth.middleware");
const controller = require("./errands.controller");
const validation = require("./errands.validation");
const matchingController = require("../matching/matching.controller");
const { matchListSchema } = require("../matching/matching.validation");

const router = express.Router();
const requireAuth = authMiddleware.requireAuth;
const optionalAuth =
  authMiddleware.optionalAuth ||
  ((req, res, next) => {
    req.user = null;
    next();
  });

router.get(
  "/",
  optionalAuth,
  validate(validation.listErrandsSchema),
  controller.listErrands,
);

router.post(
  "/",
  requireAuth,
  validate(validation.createErrandSchema),
  controller.createErrand,
);

router.get(
  "/:id/matches",
  requireAuth,
  validate(matchListSchema),
  matchingController.getTripsForErrand,
);

router.get(
  "/:id",
  optionalAuth,
  validate(validation.errandIdSchema),
  controller.getErrandById,
);

router.patch(
  "/:id",
  requireAuth,
  validate(validation.updateErrandSchema),
  controller.updateErrand,
);

router.post(
  "/:id/cancel",
  requireAuth,
  validate(validation.errandIdSchema),
  controller.cancelErrand,
);

module.exports = router;
