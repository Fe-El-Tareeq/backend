const express = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./locations.controller");
const {
  listCitiesSchema,
  listNeighborhoodsSchema,
} = require("./locations.validation");

const router = express.Router();

router.get("/cities", validate(listCitiesSchema), controller.listCities);
router.get(
  "/neighborhoods",
  validate(listNeighborhoodsSchema),
  controller.listActiveNeighborhoods,
);

module.exports = router;
