const { z } = require("zod");
const {
  FEEDBACK_TAGS,
  PAYMENT_MODALITIES,
  MAX_FEEDBACK_TAGS,
} = require("./ratings.constants");
const empty = z.object({}).optional();
const createRatingSchema = z.object({
  body: z
    .object({
      assignmentId: z.string().uuid("Assignment ID must be a valid UUID."),
      ratingStars: z.number().int().min(1).max(5),
      comments: z.string().trim().min(1).max(500).nullable().optional(),
      feedbackTags: z
        .array(z.enum(FEEDBACK_TAGS))
        .max(MAX_FEEDBACK_TAGS)
        .refine(
          (tags) => new Set(tags).size === tags.length,
          "Feedback tags must be unique.",
        )
        .default([]),
      paymentModalityConfirmed: z
        .enum(PAYMENT_MODALITIES)
        .nullable()
        .optional(),
    })
    .strict(),
  params: empty,
  query: empty,
});
const assignmentRatingsSchema = z.object({
  body: empty,
  params: z.object({
    assignmentId: z.string().uuid("Assignment ID must be a valid UUID."),
  }),
  query: empty,
});
const paginatedSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
const summarySchema = z.object({ body: empty, params: empty, query: empty });
module.exports = {
  createRatingSchema,
  assignmentRatingsSchema,
  paginatedSchema,
  summarySchema,
};
