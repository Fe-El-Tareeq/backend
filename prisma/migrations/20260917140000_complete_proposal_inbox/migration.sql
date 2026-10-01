ALTER TABLE "proposals"
ADD COLUMN "rejection_note" VARCHAR(255),
ADD COLUMN "read_at" TIMESTAMPTZ(6),
ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6);

CREATE INDEX "proposals_initiated_by_id_status_created_at_idx"
ON "proposals"("initiated_by_id", "status", "created_at");

CREATE INDEX "proposals_read_at_status_idx"
ON "proposals"("read_at", "status");
