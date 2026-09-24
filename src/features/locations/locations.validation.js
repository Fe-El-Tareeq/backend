const { z } = require("zod");
const { zoneKeys } = require("./locations.catalog");

const zoneKeySchema = z.enum(zoneKeys);

const addAliasConflictIssue = (data, ctx, canonical, alias) => {
  if (data[canonical] && data[alias] && data[canonical] !== data[alias]) {
    ctx.addIssue({
      code: "custom",
      path: [canonical],
      message: `${canonical} and ${alias} must identify the same zone.`,
    });
  }
};

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
      zoneKey: zoneKeySchema.optional(),
      city: zoneKeySchema.optional(),
    })
    .strict()
    .superRefine((data, ctx) =>
      addAliasConflictIssue(data, ctx, "zoneKey", "city"),
    ),
});

module.exports = {
  listCitiesSchema,
  listNeighborhoodsSchema,
  zoneKeySchema,
  addAliasConflictIssue,
};
