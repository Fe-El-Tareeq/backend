ALTER TABLE "notifications"
ADD COLUMN "metadata" JSONB,
ADD COLUMN "idempotency_key" VARCHAR(150);

CREATE UNIQUE INDEX "notifications_idempotency_key_key"
ON "notifications"("idempotency_key");

CREATE INDEX "notifications_user_id_notification_type_created_at_idx"
ON "notifications"("user_id", "notification_type", "created_at");
