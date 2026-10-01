const { z } = require("zod");

const assignmentIdSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Assignment ID must be a valid UUID."),
  }),
  query: z.object({}).optional(),
});

const optionalEstimatedDeliveryAtSchema = z
  .string()
  .datetime({
    offset: true,
    message: "Estimated delivery time must be a valid ISO datetime.",
  })
  .nullable()
  .optional();

const startDeliverySchema = z.object({
  body: z
    .object({
      estimatedDeliveryAt: optionalEstimatedDeliveryAtSchema,
    })
    .strict()
    .optional(),
  params: z.object({
    id: z.string().uuid("Assignment ID must be a valid UUID."),
  }),
  query: z.object({}).optional(),
});

const updateEstimatedDeliveryTimeSchema = z.object({
  body: z
    .object({
      estimatedDeliveryAt: z
        .string()
        .datetime({
          offset: true,
          message: "Estimated delivery time must be a valid ISO datetime.",
        })
        .nullable(),
    })
    .strict(),
  params: z.object({
    id: z.string().uuid("Assignment ID must be a valid UUID."),
  }),
  query: z.object({}).optional(),
});

const listAssignmentsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

const cancelAssignmentSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1).max(255).optional(),
  }).optional(),
  params: z.object({
    id: z.string().uuid("Assignment ID must be a valid UUID."),
  }),
  query: z.object({}).optional(),
});

module.exports = {
  assignmentIdSchema,
  startDeliverySchema,
  updateEstimatedDeliveryTimeSchema,
  listAssignmentsSchema,
  cancelAssignmentSchema,
};
