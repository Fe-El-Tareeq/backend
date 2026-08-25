const { z } = require("zod");

const {
  MIN_DEPARTURE_LEAD_MINUTES,
  MAX_DEPARTURE_DAYS,
} = require("./trips.constants");

const ORIGIN_TYPES = [
  "DEFAULT_NEIGHBORHOOD",
  "CUSTOM_KEYWORD",
];

const WEIGHT_CLASSES = [
  "LIGHT",
  "MEDIUM",
  "HEAVY",
];

const TRIP_STATUSES = [
  "ACTIVE",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
];

// Checks that departure time is at least 15 minutes in the future
// and no more than 3 days from now.
const validateDepartureTime = (value, ctx) => {
  const departureTime = new Date(value);
  const now = Date.now();

  const minimumDepartureTime =
    now + MIN_DEPARTURE_LEAD_MINUTES * 60 * 1000;

  const maximumDepartureTime =
    now + MAX_DEPARTURE_DAYS * 24 * 60 * 60 * 1000;

  if (departureTime.getTime() < minimumDepartureTime) {
    ctx.addIssue({
      code: "custom",
      message: `Departure time must be at least ${MIN_DEPARTURE_LEAD_MINUTES} minutes from now.`,
    });
  }

  if (departureTime.getTime() > maximumDepartureTime) {
    ctx.addIssue({
      code: "custom",
      message: `Departure time cannot be more than ${MAX_DEPARTURE_DAYS} days from now.`,
    });
  }
};

// Reusable departure time field.
const departureTimeSchema = z
  .string()
  .datetime({
    offset: true,
    message:
      "Departure time must be a valid ISO datetime with timezone.",
  })
  .superRefine(validateDepartureTime);

const returnTimeSchema = z.string().datetime({
  offset: true,
  message: "Expected return time must be a valid ISO datetime with timezone.",
});

// Reusable Trip UUID param.
const tripIdParamsSchema = z.object({
  id: z.string().uuid("Trip ID must be a valid UUID."),
});

// --------------------
// CREATE TRIP
// --------------------

const createTripSchema = z.object({
  body: z
    .object({
      clientRequestKey: z
        .string()
        .uuid("Client request key must be a valid UUID."),

      originType: z.enum(ORIGIN_TYPES),

      originNeighborhoodId: z.string().uuid("Origin neighborhood ID must be a valid UUID.").optional(),

      customOriginKeyword: z
        .string()
        .trim()
        .min(2, "Custom origin must be at least 2 characters.")
        .max(150, "Custom origin must not exceed 150 characters.")
        .nullable()
        .optional(),

      destinationKeyword: z
        .string()
        .trim()
        .min(2, "Destination must be at least 2 characters.")
        .max(150, "Destination must not exceed 150 characters."),

      destinationNeighborhoodId: z.string().uuid("Destination neighborhood ID must be a valid UUID."),

      departureTime: departureTimeSchema,

      expectedReturnTime: returnTimeSchema,

      maxCapacityClass: z.enum(WEIGHT_CLASSES),

      maxCapacityUnits: z
        .number()
        .int("Maximum capacity units must be an integer.")
        .positive("Maximum capacity units must be greater than 0."),

      notes: z
        .string()
        .trim()
        .min(1, "Notes cannot be empty.")
        .max(120, "Notes must not exceed 120 characters.")
        .nullable()
        .optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (new Date(data.expectedReturnTime) <= new Date(data.departureTime)) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedReturnTime"],
          message: "Expected return time must be after departure time.",
        });
      }
      if (
        data.originType === "DEFAULT_NEIGHBORHOOD" &&
        (data.customOriginKeyword != null || data.originNeighborhoodId != null)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["customOriginKeyword"],
          message:
            "Custom origin must not be provided when using the default neighborhood.",
        });
      }

      if (
        data.originType === "CUSTOM_KEYWORD" &&
        (!data.customOriginKeyword || !data.originNeighborhoodId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["customOriginKeyword"],
          message:
            "Custom origin text and origin neighborhood ID are required when origin type is CUSTOM_KEYWORD.",
        });
      }
    }),

  params: z.object({}),
  query: z.object({}),
});

// --------------------
// GET TRIP DETAILS
// --------------------

const getTripByIdSchema = z.object({
  body: z.object({}),
  params: tripIdParamsSchema,
  query: z.object({}),
});

// --------------------
// UPDATE TRIP
// --------------------

const updateTripSchema = z.object({
  body: z
    .object({
      departureTime: departureTimeSchema.optional(),

      expectedReturnTime: returnTimeSchema.optional(),

      maxCapacityClass: z
        .enum(WEIGHT_CLASSES)
        .optional(),

      maxCapacityUnits: z
        .number()
        .int("Maximum capacity units must be an integer.")
        .positive("Maximum capacity units must be greater than 0.")
        .optional(),

      notes: z
        .string()
        .trim()
        .min(1, "Notes cannot be empty.")
        .max(120, "Notes must not exceed 120 characters.")
        .nullable()
        .optional(),
    })
    .strict()
    .refine(
      (data) => Object.keys(data).length > 0,
      {
        message:
          "At least one editable field must be provided.",
      },
    ),

  params: tripIdParamsSchema,
  query: z.object({}),
});

// --------------------
// CANCEL TRIP
// --------------------

const cancelTripSchema = z.object({
  body: z.object({}).strict(),
  params: tripIdParamsSchema,
  query: z.object({}),
});

// --------------------
// LIST TRIPS
// --------------------

const listTripsSchema = z.object({
  body: z.object({}),

  params: z.object({}),

  query: z
    .object({
      neighborhoodId: z
        .string()
        .uuid("Neighborhood ID must be a valid UUID.")
        .optional(),

      destinationKeyword: z
        .string()
        .trim()
        .min(2, "Destination search must be at least 2 characters.")
        .max(150, "Destination search must not exceed 150 characters.")
        .optional(),

      status: z
        .enum(TRIP_STATUSES)
        .optional(),

      departureFrom: z
        .string()
        .datetime({
          offset: true,
          message:
            "departureFrom must be a valid ISO datetime with timezone.",
        })
        .optional(),

      departureTo: z
        .string()
        .datetime({
          offset: true,
          message:
            "departureTo must be a valid ISO datetime with timezone.",
        })
        .optional(),

      mine: z.coerce
        .boolean()
        .optional()
        .default(false),

      skip: z.coerce
        .number()
        .int("Skip must be an integer.")
        .min(0, "Skip must be greater than or equal to 0.")
        .default(0),

      take: z.coerce
        .number()
        .int("Take must be an integer.")
        .min(1, "Take must be at least 1.")
        .max(50, "Take must not exceed 50.")
        .default(20),
    })
    .superRefine((data, ctx) => {
      if (
        data.departureFrom &&
        data.departureTo &&
        new Date(data.departureFrom) >
          new Date(data.departureTo)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["departureTo"],
          message:
            "departureTo must be after departureFrom.",
        });
      }
    }),
});

module.exports = {
  createTripSchema,
  getTripByIdSchema,
  updateTripSchema,
  cancelTripSchema,
  listTripsSchema,
};
