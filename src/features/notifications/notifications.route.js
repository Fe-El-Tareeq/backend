const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./notifications.controller");
const {
  emptyRequestSchema,
  listNotificationsSchema,
  notificationIdSchema,
} = require("./notifications.validation");

const router = express.Router();

router.use(requireAuth);

router.get("/", validate(listNotificationsSchema), controller.list);
router.get(
  "/unread-count",
  validate(emptyRequestSchema),
  controller.unreadCount,
);
router.post("/read-all", validate(emptyRequestSchema), controller.markAllRead);
router.post("/:id/read", validate(notificationIdSchema), controller.markRead);

module.exports = router;
