const { z } = require("zod");

const phoneSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .min(8, "Phone number is too short")
      .max(20, "Phone number is too long"),

    channel: z.enum(["SMS", "WHATSAPP"]).optional(),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .min(8, "Phone number is too short")
      .max(20, "Phone number is too long"),

    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must contain digits only"),
  }),
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z
      .string()
      .min(1, "Refresh token is required"),
  }),
});

module.exports = {
  phoneSchema,
  verifyOtpSchema,
  refreshTokenSchema,
};
