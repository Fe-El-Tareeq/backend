ALTER TYPE "UserStatus" ADD VALUE 'DEACTIVATED';
CREATE TABLE "legal_acceptances" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "terms_version" VARCHAR(30) NOT NULL, "privacy_version" VARCHAR(30) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_acceptances_user_id_terms_version_privacy_version_key" ON "legal_acceptances"("user_id", "terms_version", "privacy_version");
CREATE INDEX "legal_acceptances_user_id_accepted_at_idx" ON "legal_acceptances"("user_id", "accepted_at");
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
