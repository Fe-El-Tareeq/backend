const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./chat.controller");
const {
  messageListSchema,
  markReadSchema,
  roomDetailSchema,
  roomListSchema,
  sendMessageSchema,
  syncMessagesSchema,
} = require("./chat.validation");

const router = express.Router();

router.use(requireAuth);

router.get("/", validate(roomListSchema), controller.listRooms);
router.get("/:roomId", validate(roomDetailSchema), controller.getRoom);
router.get("/:roomId/messages", validate(messageListSchema), controller.listMessages);
router.post("/:roomId/messages", validate(sendMessageSchema), controller.sendMessage);
router.get("/:roomId/sync", validate(syncMessagesSchema), controller.syncMessages);
router.post("/:roomId/read", validate(markReadSchema), controller.markRead);

module.exports = router;
