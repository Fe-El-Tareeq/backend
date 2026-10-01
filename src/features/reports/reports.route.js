const express = require("express");
const {
  requireAdmin,
  requireAuth,
} = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const c = require("./reports.controller");
const v = require("./reports.validation");
const router = express.Router();
router.use(requireAuth);
router.post("/", validate(v.create), c.create);
router.get("/", validate(v.list), c.listMine);
router.get("/admin", requireAdmin, validate(v.list), c.listAdmin);
router.get("/admin/:id", requireAdmin, validate(v.get), c.getAdmin);
router.patch("/admin/:id", requireAdmin, validate(v.update), c.update);
router.get("/:id", validate(v.get), c.get);
module.exports = router;
