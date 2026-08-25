const FEATURE_NAME = "trips";

// A trip must be scheduled at least 15 minutes from the current time.
const MIN_DEPARTURE_LEAD_MINUTES = 15;

// A trip cannot be scheduled more than 3 days in advance.
const MAX_DEPARTURE_DAYS = 3;

// Fields that the traveler is allowed to change after publishing the trip.
const TRIP_UPDATE_ALLOWED_FIELDS = [
  "departureTime",
  "maxCapacityClass",
  "maxCapacityUnits",
  "notes",
];

module.exports = {
  FEATURE_NAME,
  MIN_DEPARTURE_LEAD_MINUTES,
  MAX_DEPARTURE_DAYS,
  TRIP_UPDATE_ALLOWED_FIELDS,
};