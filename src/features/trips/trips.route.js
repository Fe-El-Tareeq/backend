const express = require("express");

const controller = require("./trips.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");

const {
  createTripSchema,
  getTripByIdSchema,
  updateTripSchema,
  cancelTripSchema,
  listTripsSchema,
} = require("./trips.validation");
const matchingController = require("../matching/matching.controller");
const { matchListSchema } = require("../matching/matching.validation");

const router = express.Router();

// All Trips routes require authentication.
router.use(requireAuth);

// Create a new trip.
router.post("/", validate(createTripSchema), controller.createTrip);

// Get a paginated/filterable list of trips.
router.get("/", validate(listTripsSchema), controller.getTrips);

router.get(
  "/:id/matching-errands",
  validate(matchListSchema),
  matchingController.getErrandsForTrip,
);

// Get one trip by ID.
router.get("/:id", validate(getTripByIdSchema), controller.getTripById);

// Update an active trip owned by the traveler.
router.patch("/:id", validate(updateTripSchema), controller.updateTrip);

// Cancel an active trip owned by the traveler.
router.post("/:id/cancel", validate(cancelTripSchema), controller.cancelTrip);

module.exports = router;
