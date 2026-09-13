const { z } = require("zod");

// Validates the payload used to update the current user's profile.
const updateProfileSchema = z.object({
  body: z
    .object({
      fullName: z
        .string()
        .trim()
        .min(2, "Full name must be at least 2 characters.")
        .max(100, "Full name must not exceed 100 characters.")
        .optional(),

      neighborhoodId: z
        .string()
        .uuid("Neighborhood ID must be a valid UUID.")
        .optional(),
    })
    .refine(
      (data) =>
        data.fullName !== undefined || data.neighborhoodId !== undefined,
      {
        message: "At least one field must be provided for update.",
      },
    ),

  params: z.object({}),
  query: z.object({}),
});

const updateNotificationSettingsSchema = z.object({
  body: z
    .object({
      newTripsEnabled: z.boolean().optional(),
      chatMessagesEnabled: z.boolean().optional(),
      requestUpdatesEnabled: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one notification setting must be provided.",
    }),
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});

const deactivateAccountSchema = z.object({
  body: z
    .object({ password: z.string().min(1), confirmation: z.literal("DELETE") })
    .strict(),
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});

module.exports = {
  updateProfileSchema,
  updateNotificationSettingsSchema,
  deactivateAccountSchema,
};
