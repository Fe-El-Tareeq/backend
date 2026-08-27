const { z } = require("zod");

const { MAX_VOICE_NOTE_DURATION_SEC } = require("./errands.rules");

const weightClassSchema = z.enum(["LIGHT", "MEDIUM", "HEAVY"]);

const isoFutureDateSchema = z
  .string()
  .datetime({ offset: true, message: "Date must be a valid ISO datetime." })
  .refine((value) => new Date(value).getTime() > Date.now(), {
    message: "Date must be in the future.",
  });

const voiceNoteUrlSchema = z
  .string()
  .trim()
  .url("Voice note URL must be a valid URL.")
  .max(2048, "Voice note URL must not exceed 2048 characters.")
  .nullable()
  .optional();

const voiceNoteDurationSchema = z
  .number()
  .int("Voice note duration must be an integer.")
  .min(0, "Voice note duration must not be negative.")
  .max(
    MAX_VOICE_NOTE_DURATION_SEC,
    `Voice note duration must not exceed ${MAX_VOICE_NOTE_DURATION_SEC} seconds.`,
  )
  .nullable()
  .optional();

const baseWriteFields = {
  categoryId: z.string().uuid("Category ID must be a valid UUID."),
  pickupNeighborhoodId: z
    .string()
    .uuid("Pickup neighborhood ID must be a valid UUID."),
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters.")
    .max(80, "Title must not exceed 80 characters."),
  itemsDescription: z
    .string()
    .trim()
    .min(3, "Items description must be at least 3 characters.")
    .max(1000, "Items description must not exceed 1000 characters."),
  destinationKeyword: z
    .string()
    .trim()
    .min(2, "Destination keyword must be at least 2 characters.")
    .max(150, "Destination keyword must not exceed 150 characters."),
  weightClass: weightClassSchema,
  isUrgent: z.boolean().optional(),
  isInterZone: z.boolean().optional(),
  neededByTime: isoFutureDateSchema.nullable().optional(),
  voiceNoteUrl: voiceNoteUrlSchema,
  voiceNoteDurationSec: voiceNoteDurationSchema,
};

const createErrandSchema = z.object({
  body: z
    .object({
      clientRequestKey: z
        .string()
        .uuid("Client request key must be a valid UUID."),
      ...baseWriteFields,
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});

const updateErrandSchema = z.object({
  body: z
    .object({
      ...baseWriteFields,
    })
    .partial()
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update.",
    }),
  params: z.object({
    id: z.string().uuid("Errand ID must be a valid UUID."),
  }),
  query: z.object({}),
});

const errandIdSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Errand ID must be a valid UUID."),
  }),
  query: z.object({}),
});

const listErrandsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    neighborhoodId: z
      .string()
      .uuid("Neighborhood ID must be a valid UUID.")
      .optional(),
    categoryId: z
      .string()
      .uuid("Category ID must be a valid UUID.")
      .optional(),
    status: z
      .enum(["OPEN", "MATCHED", "CANCELLED", "EXPIRED", "COMPLETED"])
      .optional(),
    urgent: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    skip: z.coerce
      .number()
      .int("Skip must be an integer.")
      .min(0, "Skip must not be negative.")
      .default(0),
    take: z.coerce
      .number()
      .int("Take must be an integer.")
      .min(1, "Take must be at least 1.")
      .max(50, "Take must not exceed 50.")
      .default(20),
  }),
});

module.exports = {
  createErrandSchema,
  updateErrandSchema,
  errandIdSchema,
  listErrandsSchema,
};
