const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./matching.controller");
const { matchListSchema } = require("./matching.validation");

const router = express.Router();
router.use(requireAuth);
router.get("/errands/:id", validate(matchListSchema), controller.getTripsForErrand);
router.get("/trips/:id", validate(matchListSchema), controller.getErrandsForTrip);
module.exports = router;
