CREATE TABLE "user_notification_preferences" (
    "user_id" UUID NOT NULL,
    "new_trips_enabled" BOOLEAN NOT NULL DEFAULT true,
    "chat_messages_enabled" BOOLEAN NOT NULL DEFAULT true,
    "request_updates_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_notification_preferences"
ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
