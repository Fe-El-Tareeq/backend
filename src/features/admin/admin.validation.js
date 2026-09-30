const { z } = require("zod");

const paymentInvoiceIdParams = z.object({
  id: z.string().uuid("Payment invoice ID must be a valid UUID."),
});

const listPaymentInvoicesSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).strict(),
  query: z.object({
    status: z.enum(["PENDING_VERIFICATION", "PAID", "FAILED"]).default("PENDING_VERIFICATION"),
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(50).default(20),
  }).strict(),
});

const paymentInvoiceActionSchema = z.object({
  body: z.object({}).strict(),
  params: paymentInvoiceIdParams,
  query: z.object({}).strict(),
});

const rejectPaymentInvoiceSchema = z.object({
  body: z.object({ notes: z.string().trim().min(3).max(500) }).strict(),
  params: paymentInvoiceIdParams,
  query: z.object({}).strict(),
});

const verificationIdParams = z.object({
  id: z.string().uuid("Verification ID must be a valid UUID."),
});

const listVerificationsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).strict(),
  query: z.object({
    status: z
      .enum(["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"])
      .default("PENDING_REVIEW"),
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

const verificationDetailsSchema = z.object({
  body: z.object({}).optional(),
  params: verificationIdParams,
  query: z.object({}).strict(),
});

const approveVerificationSchema = z.object({
  body: z.object({}).strict(),
  params: verificationIdParams,
  query: z.object({}).strict(),
});

const rejectVerificationSchema = z.object({
  body: z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
  params: verificationIdParams,
  query: z.object({}).strict(),
});

const faqIdParams = z.object({
  id: z.string().uuid("FAQ ID must be a valid UUID."),
});

const listFaqsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).strict(),
  query: z
    .object({
      isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      skip: z.coerce.number().int().min(0).default(0),
      take: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict(),
});

const createFaqSchema = z.object({
  body: z
    .object({
      question: z.string().trim().min(3).max(300),
      answer: z.string().trim().min(3).max(3000),
      displayOrder: z.number().int().min(0).max(100000).default(0),
      isActive: z.boolean().default(true),
    })
    .strict(),
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});

const updateFaqSchema = z.object({
  body: z
    .object({
      question: z.string().trim().min(3).max(300).optional(),
      answer: z.string().trim().min(3).max(3000).optional(),
      displayOrder: z.number().int().min(0).max(100000).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine(
      (body) => Object.keys(body).length > 0,
      "At least one field is required.",
    ),
  params: faqIdParams,
  query: z.object({}).strict(),
});

const deleteFaqSchema = z.object({
  body: z.object({}).optional(),
  params: faqIdParams,
  query: z.object({}).strict(),
});

const reorderFaqsSchema = z.object({
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              id: z.string().uuid("FAQ ID must be a valid UUID."),
              displayOrder: z.number().int().min(0).max(100000),
            })
            .strict(),
        )
        .min(1)
        .max(100)
        .refine(
          (items) =>
            new Set(items.map((item) => item.id)).size === items.length,
          "FAQ IDs must be unique.",
        ),
    })
    .strict(),
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});

module.exports = {
  listVerificationsSchema,
  listPaymentInvoicesSchema,
  paymentInvoiceActionSchema,
  rejectPaymentInvoiceSchema,
  verificationDetailsSchema,
  approveVerificationSchema,
  rejectVerificationSchema,
  listFaqsSchema,
  createFaqSchema,
  updateFaqSchema,
  deleteFaqSchema,
  reorderFaqsSchema,
};
