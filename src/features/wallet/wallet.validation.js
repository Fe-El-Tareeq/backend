const { z } = require("zod");

// Validates pagination query parameters for wallet transaction history.
const transactionsQuerySchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    skip: z.coerce
      .number()
      .int("Skip must be an integer.")
      .min(0, "Skip must be greater than or equal to 0.")
      .default(0),

    take: z.coerce
      .number()
      .int("Take must be an integer.")
      .min(1, "Take must be at least 1.")
      .max(100, "Take must not exceed 100.")
      .default(20),
  }),
});

module.exports = {
  transactionsQuerySchema,
};
