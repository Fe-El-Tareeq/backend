const { z } = require("zod");

const {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VOICE_MIME_TYPES,
  DEFAULT_MESSAGE_LIMIT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_MESSAGE_LIMIT,
  MAX_VOICE_DURATION_SEC,
  MAX_VOICE_SIZE_BYTES,
  MESSAGE_TYPES,
} = require("./chat.constants");

const roomParamsSchema = z.object({
  roomId: z.string().uuid("Chat room ID must be a valid UUID."),
});

const messageListSchema = z.object({
  body: z.object({}).optional(),
  params: roomParamsSchema,
  query: z.object({
    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(MAX_MESSAGE_LIMIT, `Limit must not exceed ${MAX_MESSAGE_LIMIT}.`)
      .default(DEFAULT_MESSAGE_LIMIT),
    before: z
      .string()
      .uuid("Before cursor must be a valid message ID.")
      .optional(),
  }),
});

const roomDetailSchema = z.object({
  body: z.object({}).optional(),
  params: roomParamsSchema,
  query: z.object({}).optional(),
});

const roomListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const textMessageSchema = z
  .object({
    clientMessageKey: z
      .string()
      .uuid("Client message key must be a valid UUID."),
    type: z.literal(MESSAGE_TYPES.TEXT),
    text: z
      .string()
      .trim()
      .min(1, "Text message cannot be empty.")
      .max(500, "Text message must not exceed 500 characters."),
  })
  .strict();

const voiceMessageSchema = z
  .object({
    clientMessageKey: z
      .string()
      .uuid("Client message key must be a valid UUID."),
    type: z.literal(MESSAGE_TYPES.VOICE),
    voiceNoteUrl: z
      .string()
      .trim()
      .min(1, "Voice note URL is required."),
    voiceNoteDurationSec: z
      .number()
      .int("Voice note duration must be an integer.")
      .min(0, "Voice note duration cannot be negative.")
      .max(
        MAX_VOICE_DURATION_SEC,
        `Voice note duration must not exceed ${MAX_VOICE_DURATION_SEC} seconds.`,
      ),
    voiceNoteSizeBytes: z
      .number()
      .int("Voice note size must be an integer.")
      .min(1, "Voice note size is required.")
      .max(
        MAX_VOICE_SIZE_BYTES,
        `Voice note size must not exceed ${MAX_VOICE_SIZE_BYTES} bytes.`,
      ),
    voiceMimeType: z.enum(ALLOWED_VOICE_MIME_TYPES, {
      message: "Voice MIME type is not supported.",
    }),
  })
  .strict();

const imageMessageSchema = z
  .object({
    clientMessageKey: z
      .string()
      .uuid("Client message key must be a valid UUID."),
    type: z.literal(MESSAGE_TYPES.IMAGE),
    imageUrl: z.string().trim().min(1, "Image URL is required."),
    imageSizeBytes: z
      .number()
      .int("Image size must be an integer.")
      .min(1, "Image size is required.")
      .max(
        MAX_IMAGE_SIZE_BYTES,
        `Image size must not exceed ${MAX_IMAGE_SIZE_BYTES} bytes.`,
      ),
    imageMimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES, {
      message: "Image MIME type is not supported.",
    }),
  })
  .strict();

const sendMessageSchema = z.object({
  body: z.discriminatedUnion("type", [
    textMessageSchema,
    voiceMessageSchema,
    imageMessageSchema,
  ]),
  params: roomParamsSchema,
  query: z.object({}).optional(),
});

const syncMessagesSchema = z.object({
  body: z.object({}).optional(),
  params: roomParamsSchema,
  query: z.object({
    since: z.string().datetime({
      offset: true,
      message: "Since must be a valid ISO datetime with timezone.",
    }),
    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(MAX_MESSAGE_LIMIT, `Limit must not exceed ${MAX_MESSAGE_LIMIT}.`)
      .default(DEFAULT_MESSAGE_LIMIT),
  }),
});

const markReadSchema = z.object({
  body: z.object({}).strict(),
  params: roomParamsSchema,
  query: z.object({}).optional(),
});

module.exports = {
  markReadSchema,
  messageListSchema,
  roomDetailSchema,
  roomListSchema,
  sendMessageSchema,
  syncMessagesSchema,
};
