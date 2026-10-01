CREATE TABLE "pending_registrations" (
  "id" UUID NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "full_name" VARCHAR(100) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "neighborhood_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_registrations_phone_key" ON "pending_registrations"("phone");
CREATE INDEX "pending_registrations_expires_at_idx" ON "pending_registrations"("expires_at");

ALTER TABLE "pending_registrations"
ADD CONSTRAINT "pending_registrations_neighborhood_id_fkey"
FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
