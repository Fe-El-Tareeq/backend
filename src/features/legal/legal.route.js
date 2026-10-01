const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const ApiResponse = require("../../utils/ApiResponse");
const service = require("./legal.service");
const router = express.Router();
router.get("/current", (req, res) =>
  res.json(
    new ApiResponse(
      200,
      "Current legal versions retrieved successfully.",
      service.current(),
    ),
  ),
);
router.post(
  "/acceptances",
  requireAuth,
  validate(
    z.object({
      body: z
        .object({
          termsVersion: z.string().min(1).max(30),
          privacyVersion: z.string().min(1).max(30),
        })
        .strict(),
      params: z.object({}).strict(),
      query: z.object({}).strict(),
    }),
  ),
  async (req, res, next) => {
    try {
      const x = await service.accept(req.user.id, req.validatedData.body);
      res
        .status(x.created ? 201 : 200)
        .json(
          new ApiResponse(
            x.created ? 201 : 200,
            "Legal acceptance recorded successfully.",
            x,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);
module.exports = router;
