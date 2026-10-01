CREATE TYPE "PaymentMethod" AS ENUM ('QR', 'OTP');

ALTER TABLE "payment_invoices"
  ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'QR',
  ADD COLUMN "payment_phone" VARCHAR(20),
  ADD COLUMN "otp_hash" VARCHAR(64),
  ADD COLUMN "otp_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "otp_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otp_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "otp_verified_at" TIMESTAMPTZ(6),
  ALTER COLUMN "qr_code_payload" DROP NOT NULL;

CREATE INDEX "payment_invoices_payment_method_status_idx"
  ON "payment_invoices" ("payment_method", "status");
