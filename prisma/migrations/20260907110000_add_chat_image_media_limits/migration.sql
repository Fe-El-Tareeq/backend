ALTER TYPE "MessageType" ADD VALUE 'IMAGE';

ALTER TABLE "chat_messages"
ADD COLUMN "audio_size_bytes" INTEGER,
ADD COLUMN "audio_mime_type" VARCHAR(50),
ADD COLUMN "image_url" TEXT,
ADD COLUMN "image_size_bytes" INTEGER,
ADD COLUMN "image_mime_type" VARCHAR(50);
