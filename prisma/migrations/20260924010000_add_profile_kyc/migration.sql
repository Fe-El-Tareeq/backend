CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

ALTER TABLE "users"
ADD COLUMN "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "id_front_image_path" VARCHAR(500) NOT NULL,
    "id_back_image_path" VARCHAR(500) NOT NULL,
    "selfie_image_path" VARCHAR(500) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by_admin_id" UUID,
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "users_verification_status_idx" ON "users"("verification_status");
CREATE INDEX "identity_verifications_user_id_submitted_at_idx" ON "identity_verifications"("user_id", "submitted_at");
CREATE INDEX "identity_verifications_status_submitted_at_idx" ON "identity_verifications"("status", "submitted_at");
CREATE INDEX "identity_verifications_reviewed_by_admin_id_idx" ON "identity_verifications"("reviewed_by_admin_id");
CREATE UNIQUE INDEX "identity_verifications_one_pending_per_user_idx"
ON "identity_verifications"("user_id") WHERE "status" = 'PENDING_REVIEW';

ALTER TABLE "identity_verifications"
ADD CONSTRAINT "identity_verifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "identity_verifications"
ADD CONSTRAINT "identity_verifications_reviewed_by_admin_id_fkey"
FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
