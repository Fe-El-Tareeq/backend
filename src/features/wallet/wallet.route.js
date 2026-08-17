const express = require("express");

const controller = require("./wallet.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const { transactionsQuerySchema } = require("./wallet.validation");

const router = express.Router();

// All wallet routes require an authenticated user.
router.use(requireAuth);

// Returns the authenticated user's wallet.
router.get("/", controller.getWallet);

// Returns the authenticated user's wallet transaction history.
router.get(
  "/transactions",
  validate(transactionsQuerySchema),
  controller.getTransactions,
);

module.exports = router;
