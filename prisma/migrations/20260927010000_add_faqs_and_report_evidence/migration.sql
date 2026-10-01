CREATE TABLE "faqs" (
  "id" UUID NOT NULL,
  "question" VARCHAR(300) NOT NULL,
  "answer" VARCHAR(3000) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faqs_is_active_display_order_idx"
ON "faqs"("is_active", "display_order");

ALTER TABLE "faqs"
ADD CONSTRAINT "faqs_display_order_non_negative"
CHECK ("display_order" >= 0);

CREATE TABLE "support_report_evidence" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "chat_room_id" UUID,
  "snapshot" JSONB NOT NULL,
  "message_count" INTEGER NOT NULL,
  "snapshot_taken_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_report_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_report_evidence_report_id_key"
ON "support_report_evidence"("report_id");

CREATE INDEX "support_report_evidence_chat_room_id_idx"
ON "support_report_evidence"("chat_room_id");

ALTER TABLE "support_report_evidence"
ADD CONSTRAINT "support_report_evidence_message_count_range"
CHECK ("message_count" >= 0 AND "message_count" <= 50);

ALTER TABLE "support_report_evidence"
ADD CONSTRAINT "support_report_evidence_report_id_fkey"
FOREIGN KEY ("report_id") REFERENCES "support_reports"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_report_evidence"
ADD CONSTRAINT "support_report_evidence_chat_room_id_fkey"
FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
