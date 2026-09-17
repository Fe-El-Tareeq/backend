const { z } = require("zod");
const { cityKeys } = require("./locations.catalog");

const listCitiesSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}).strict(),
});

const listNeighborhoodsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z
    .object({
      city: z.enum(cityKeys).optional(),
    })
    .strict(),
});

module.exports = {
  listCitiesSchema,
  listNeighborhoodsSchema,
};
