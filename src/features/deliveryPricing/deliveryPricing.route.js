const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const controller = require("./deliveryPricing.controller");
const { quoteSchema } = require("./deliveryPricing.validation");

const router = express.Router();
router.get("/quote", requireAuth, validate(quoteSchema), controller.getQuote);
module.exports = router;
