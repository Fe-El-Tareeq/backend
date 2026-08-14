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

module.exports = {
  updateProfileSchema,
};
