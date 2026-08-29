const { z } = require("zod");

const {
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
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
      .max(30, "Voice note duration must not exceed 30 seconds."),
  })
  .strict();

const sendMessageSchema = z.object({
  body: z.discriminatedUnion("type", [
    textMessageSchema,
    voiceMessageSchema,
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
