const { z } = require("zod");

const quoteSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    originNeighborhoodId: z.string().uuid().optional(),
    destinationNeighborhoodId: z.string().uuid(),
  }).strict(),
});

module.exports = { quoteSchema };
