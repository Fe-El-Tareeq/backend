const { z } = require("zod");
const { TYPES, STATUSES } = require("./reports.constants");
const empty = z.object({}).strict();
const id = z
  .object({ id: z.string().uuid("Report ID must be a valid UUID.") })
  .strict();
const list = z.object({
  body: empty.optional(),
  params: empty,
  query: z
    .object({
      status: z.enum(STATUSES).optional(),
      skip: z.coerce.number().int().min(0).default(0),
      take: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict(),
});
const create = z.object({
  body: z
    .object({
      clientRequestKey: z.string().uuid(),
      type: z.enum(TYPES),
      description: z.string().trim().min(10).max(1500),
      reportedUserId: z.string().uuid().optional(),
      assignmentId: z.string().uuid().optional(),
      errandId: z.string().uuid().optional(),
      tripId: z.string().uuid().optional(),
    })
    .strict(),
  params: empty,
  query: empty,
});
const get = z.object({ body: empty.optional(), params: id, query: empty });
const update = z.object({
  body: z
    .object({
      status: z.enum(STATUSES),
      adminNotes: z.string().trim().max(1500).optional(),
    })
    .strict(),
  params: id,
  query: empty,
});
module.exports = { list, create, get, update };
