const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./payments.controller");
const validation = require("./payments.validation");

const router = express.Router();

// Provider callbacks authenticate with their signature instead of a user JWT.
router.post(
  "/webhooks/mock",
  validate(validation.webhookSchema),
  controller.processMockWebhook,
);

router.use(requireAuth);
router.get("/packages", controller.listPackages);
router.post(
  "/invoices",
  validate(validation.createInvoiceSchema),
  controller.createInvoice,
);
router.get(
  "/invoices",
  validate(validation.listInvoicesSchema),
  controller.listInvoices,
);
router.get(
  "/invoices/:id",
  validate(validation.invoiceIdSchema),
  controller.getInvoice,
);
router.post(
  "/mock/invoices/:id/pay",
  validate(validation.invoiceIdSchema),
  controller.simulateMockPayment,
);

module.exports = router;
