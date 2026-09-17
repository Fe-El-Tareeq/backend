ALTER TABLE "pending_registrations"
ADD COLUMN "terms_version" VARCHAR(30),
ADD COLUMN "privacy_version" VARCHAR(30);

-- Existing pending registrations predate mandatory consent and cannot prove
-- which legal versions were accepted. They remain nullable and are rejected
-- by the verification flow, then removed by the existing expiry cleanup job.
