-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "otp_verifications"
ADD COLUMN "purpose" "OtpPurpose" NOT NULL DEFAULT 'PHONE_VERIFICATION';

-- DropIndex
DROP INDEX "otp_verifications_phone_created_at_idx";

-- CreateIndex
CREATE INDEX "otp_verifications_phone_purpose_created_at_idx"
ON "otp_verifications"("phone", "purpose", "created_at");
