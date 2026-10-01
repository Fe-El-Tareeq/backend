ALTER TYPE "OtpChannel" ADD VALUE 'EMAIL';
ALTER TYPE "OtpPurpose" ADD VALUE 'EMAIL_VERIFICATION';

ALTER TABLE "users"
ADD COLUMN "email" VARCHAR(254),
ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

ALTER TABLE "pending_registrations"
ADD COLUMN "email" VARCHAR(254);

ALTER TABLE "otp_verifications"
ADD COLUMN "email" VARCHAR(254),
ADD COLUMN "delivered_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "pending_registrations_email_key" ON "pending_registrations"("email");
