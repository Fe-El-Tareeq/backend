const { z } = require("zod");

const { MAX_VOICE_NOTE_DURATION_SEC } = require("./errands.rules");
const { cityKeys } = require("../locations/locations.catalog");

const weightClassSchema = z.enum(["LIGHT", "MEDIUM", "HEAVY"]);
const itemSizeSchema = z.enum(["ENVELOPE", "SMALL", "MEDIUM", "LARGE"]);

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

const errandItemSchema = z
  .object({
    categoryId: z.string().uuid("Category ID must be a valid UUID."),
    name: z
      .string()
      .trim()
      .min(2, "Item name must be at least 2 characters.")
      .max(120, "Item name must not exceed 120 characters."),
    description: z
      .string()
      .trim()
      .min(2, "Item description must be at least 2 characters.")
      .max(1000, "Item description must not exceed 1000 characters.")
      .nullable()
      .optional(),
    quantity: z
      .number()
      .int("Item quantity must be an integer.")
      .min(1, "Item quantity must be at least 1."),
    size: itemSizeSchema,
    isUrgent: z.boolean().optional(),
    itemNote: z
      .string()
      .trim()
      .min(1, "Item note must not be empty.")
      .max(500, "Item note must not exceed 500 characters.")
      .nullable()
      .optional(),
  })
  .strict();

const createErrandSchema = z.object({
  body: z
    .object({
      clientRequestKey: z
        .string()
        .uuid("Client request key must be a valid UUID."),
      pickupNeighborhoodId: baseWriteFields.pickupNeighborhoodId,
      destinationKeyword: baseWriteFields.destinationKeyword,
      title: baseWriteFields.title.optional(),
      itemsDescription: baseWriteFields.itemsDescription.optional(),
      items: z
        .array(errandItemSchema)
        .min(1, "At least one item is required.")
        .max(20, "An errand cannot contain more than 20 items."),
      isInterZone: baseWriteFields.isInterZone,
      neededByTime: baseWriteFields.neededByTime,
      voiceNoteUrl: baseWriteFields.voiceNoteUrl,
      voiceNoteDurationSec: baseWriteFields.voiceNoteDurationSec,
      imageUrls: z
        .array(
          z
            .string()
            .trim()
            .url("Each image URL must be a valid URL.")
            .max(2048, "Each image URL must not exceed 2048 characters."),
        )
        .max(5, "An errand cannot contain more than 5 images.")
        .optional(),
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

const cancelErrandSchema = z.object({
  body: z
    .object({
      cancellationReason: z
        .string()
        .trim()
        .min(3, "Cancellation reason must be at least 3 characters.")
        .max(255, "Cancellation reason must not exceed 255 characters."),
    })
    .strict(),
  params: z.object({
    id: z.string().uuid("Errand ID must be a valid UUID."),
  }),
  query: z.object({}),
});

const listErrandsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    originCity: z.enum(cityKeys).optional(),
    originNeighborhoodId: z
      .string()
      .uuid("Origin neighborhood ID must be a valid UUID.")
      .optional(),
    destinationCity: z.enum(cityKeys).optional(),
    destinationNeighborhoodId: z
      .string()
      .uuid("Destination neighborhood ID must be a valid UUID.")
      .optional(),
    neighborhoodId: z
      .string()
      .uuid("Neighborhood ID must be a valid UUID.")
      .optional(),
    categoryId: z.string().uuid("Category ID must be a valid UUID.").optional(),
    status: z
      .enum(["OPEN", "MATCHED", "CANCELLED", "EXPIRED", "COMPLETED"])
      .optional(),
    urgent: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    mine: z.coerce.boolean().default(false),
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
  cancelErrandSchema,
  listErrandsSchema,
};
