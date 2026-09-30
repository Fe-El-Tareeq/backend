
ALTER TABLE "identity_verifications"
  ALTER COLUMN "id_front_image_path" DROP NOT NULL,
  ALTER COLUMN "id_back_image_path" DROP NOT NULL,
  ALTER COLUMN "selfie_image_path" DROP NOT NULL,
  ADD COLUMN "documents_deleted_at" TIMESTAMPTZ(6);

CREATE TABLE "identity_document_cleanup" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 "paths" TEXT[] NOT NULL,
 "verification_id" UUID UNIQUE,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "identity_document_cleanup_next_attempt_at_idx"
 ON "identity_document_cleanup" ("next_attempt_at");

-- Existing rejected requests follow the same document-retention policy.
INSERT INTO "identity_document_cleanup" ("paths", "verification_id")
SELECT array_remove(ARRAY["id_front_image_path", "id_back_image_path", "selfie_image_path"], NULL), "id"
FROM "identity_verifications" WHERE "status" = 'REJECTED';
