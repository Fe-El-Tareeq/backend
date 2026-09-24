const { z } = require("zod");

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

module.exports = {
  listVerificationsSchema,
  verificationDetailsSchema,
  approveVerificationSchema,
  rejectVerificationSchema,
};
