const { z } = require("zod");

const emptyObject = z.object({}).strict();
const notificationId = z.string().uuid("Notification ID must be a valid UUID.");

const listNotificationsSchema = z.object({
  body: emptyObject.optional(),
  params: emptyObject.optional(),
  query: z
    .object({
      status: z
        .enum(["UNREAD", "PENDING", "SENT", "FAILED", "READ"])
        .optional(),
      skip: z.coerce.number().int().min(0).default(0),
      take: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict(),
});

const notificationIdSchema = z.object({
  body: emptyObject,
  params: z.object({ id: notificationId }).strict(),
  query: emptyObject,
});

const emptyRequestSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: emptyObject,
});

module.exports = {
  emptyRequestSchema,
  listNotificationsSchema,
  notificationIdSchema,
};
