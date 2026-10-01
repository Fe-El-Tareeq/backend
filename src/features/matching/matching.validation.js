const { z } = require("zod");
const { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } = require("./matching.constants");

const matchListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.string().uuid("ID must be a valid UUID.") }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(MAX_MATCH_LIMIT).default(DEFAULT_MATCH_LIMIT),
  }),
});

module.exports = { matchListSchema };
