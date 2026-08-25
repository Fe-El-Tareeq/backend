const { z } = require("zod");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/\d/, "Password must include at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must include at least one special character",
  );

const registerSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters.")
      .max(100, "Full name must not exceed 100 characters."),

    phone: z
      .string()
      .trim()
      .min(8, "Phone number is too short")
      .max(20, "Phone number is too long"),

    password: passwordSchema,

    neighborhoodId: z
      .string()
      .uuid("Neighborhood ID must be a valid UUID."),
  }),
});

const loginSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .trim()
      .min(8, "Phone number is too short")
      .max(20, "Phone number is too long"),

    password: z.string().min(1, "Password is required"),
  }),
});

const phoneSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .trim()
      .min(8, "Phone number is too short")
      .max(20, "Phone number is too long"),

    channel: z.enum(["SMS", "WHATSAPP"]).optional(),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .trim()
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

const forgotPasswordSchema = z.object({
  body: z
    .object({
      phone: z
        .string()
        .trim()
        .min(8, "Phone number is too short")
        .max(20, "Phone number is too long"),
      channel: z.enum(["SMS", "WHATSAPP"]).optional(),
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});

const resetPasswordSchema = z.object({
  body: z
    .object({
      phone: z
        .string()
        .trim()
        .min(8, "Phone number is too short")
        .max(20, "Phone number is too long"),
      otp: z
        .string()
        .length(6, "OTP must be exactly 6 digits")
        .regex(/^\d{6}$/, "OTP must contain digits only"),
      newPassword: passwordSchema,
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});

module.exports = {
  registerSchema,
  loginSchema,
  phoneSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
