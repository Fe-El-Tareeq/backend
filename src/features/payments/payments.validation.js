const { z } = require("zod");

const emptyObject = z.object({}).strict();
const uuid = (label) => z.string().uuid(`${label} must be a valid UUID.`);

const createInvoiceSchema = z.object({
  body: z
    .object({
      tokenPackageId: uuid("Token package ID"),
      clientRequestKey: uuid("Client request key"),
      paymentMethod: z.enum(["QR", "OTP", "BANK_TRANSFER"]).default("QR"),
      paymentPhone: z.string().trim().min(8).max(20).optional(),
    })
    .strict()
    .superRefine((body, context) => {
      if (body.paymentMethod === "OTP" && !body.paymentPhone) {
        context.addIssue({
          code: "custom",
          path: ["paymentPhone"],
          message: "A phone number is required for OTP payment.",
        });
      }
      if (body.paymentMethod !== "OTP" && body.paymentPhone) {
        context.addIssue({
          code: "custom",
          path: ["paymentPhone"],
          message: "A phone number is only accepted for OTP payment.",
        });
      }
    }),
  params: emptyObject,
  query: emptyObject,
});

const invoiceIdSchema = z.object({
  body: emptyObject,
  params: z.object({ id: uuid("Invoice ID") }).strict(),
  query: emptyObject,
});

const verifyOtpSchema = z.object({
  body: z
    .object({
      otp: z.string().regex(/^\d{6}$/, "OTP must contain exactly 6 digits."),
    })
    .strict(),
  params: z.object({ id: uuid("Invoice ID") }).strict(),
  query: emptyObject,
});

const listInvoicesSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z
    .object({
      status: z.enum(["PENDING", "PENDING_VERIFICATION", "PAID", "FAILED", "EXPIRED"]).optional(),
      skip: z.coerce.number().int().min(0).default(0),
      take: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict(),
});

const webhookSchema = z.object({
  body: z
    .object({
      providerInvoiceId: z.string().min(1).max(150),
      providerTransactionId: z.string().min(1).max(150),
      status: z.enum(["SUCCESS", "FAILED"]),
      amountPaidNis: z.number().finite().nonnegative().multipleOf(0.01),
      providerTimestamp: z.string().datetime(),
      failureReason: z.string().max(255).optional(),
    })
    .strict(),
  params: emptyObject,
  query: emptyObject,
});

module.exports = {
  createInvoiceSchema,
  invoiceIdSchema,
  verifyOtpSchema,
  listInvoicesSchema,
  webhookSchema,
};
