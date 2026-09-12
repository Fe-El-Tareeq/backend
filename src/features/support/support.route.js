const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./support.controller");
const v = require("./support.validation");
const router = express.Router();
router.use(requireAuth);
router.get("/config", controller.config);
router.post("/tickets", validate(v.createTicket), controller.create);
router.get("/tickets", validate(v.list), controller.listMine);
router.get("/tickets/:id", validate(v.ticket), controller.get);
router.post(
  "/tickets/:id/messages",
  validate(v.message),
  controller.sendMessage,
);
router.get("/admin/tickets", validate(v.list), controller.listAdmin);
router.patch(
  "/admin/tickets/:id/status",
  validate(v.status),
  controller.updateStatus,
);
module.exports = router;
