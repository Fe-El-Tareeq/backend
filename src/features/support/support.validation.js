const { z } = require("zod");
const { CATEGORIES, STATUSES } = require("./support.constants");
const empty = z.object({}).strict();
const idParams = z
  .object({ id: z.string().uuid("Ticket ID must be a valid UUID.") })
  .strict();
const listQuery = z
  .object({
    status: z.enum(STATUSES).optional(),
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const createTicket = z.object({
  body: z
    .object({
      clientRequestKey: z.string().uuid(),
      category: z.enum(CATEGORIES),
      message: z.string().trim().min(2).max(1000),
    })
    .strict(),
  params: empty,
  query: empty,
});
const ticket = z.object({
  body: empty.optional(),
  params: idParams,
  query: empty,
});
const message = z.object({
  body: z
    .object({
      clientMessageKey: z.string().uuid(),
      message: z.string().trim().min(1).max(1000),
    })
    .strict(),
  params: idParams,
  query: empty,
});
const list = z.object({
  body: empty.optional(),
  params: empty,
  query: listQuery,
});
const status = z.object({
  body: z.object({ status: z.enum(STATUSES) }).strict(),
  params: idParams,
  query: empty,
});
module.exports = { createTicket, ticket, message, list, status };
