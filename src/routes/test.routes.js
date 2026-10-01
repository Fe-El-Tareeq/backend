const express = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

const testSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(3, 'Name must be at least 3 characters'),
  }),
  params: z.object({}),
  query: z.object({}),
});

router.post(
  '/validation',
  validate(testSchema),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Validation passed',
      data: req.validatedData,
    });
  }
);

module.exports = router;