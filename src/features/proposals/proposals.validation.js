const { z } = require("zod");
const {
  PROPOSAL_TYPES,
  LIST_FILTER_STATUSES,
} = require("./proposals.constants");

const emptyBody = z.object({}).optional();
const emptyQuery = z.object({}).optional();
const proposalIdParams = z.object({
  id: z.string().uuid("Proposal ID must be a valid UUID."),
});
const resourceParams = (name) =>
  z.object({
    id: z.string().uuid(`${name} ID must be a valid UUID.`),
  });

const createProposalSchema = z.object({
  body: z
    .object({
      errandId: z.string().uuid("Errand ID must be a valid UUID."),
      tripId: z.string().uuid("Trip ID must be a valid UUID."),
      clientRequestKey: z
        .string()
        .uuid("Client request key must be a valid UUID."),
      type: z.enum(PROPOSAL_TYPES),
      message: z.string().trim().min(1).max(500).nullable().optional(),
    })
    .strict(),
  params: z.object({}).optional(),
  query: emptyQuery,
});

const listQuery = z.object({
  status: z.enum(LIST_FILTER_STATUSES).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

const listErrandProposalsSchema = z.object({
  body: emptyBody,
  params: resourceParams("Errand"),
  query: listQuery,
});
const listTripProposalsSchema = z.object({
  body: emptyBody,
  params: resourceParams("Trip"),
  query: listQuery,
});
const proposalActionSchema = z.object({
  body: emptyBody,
  params: proposalIdParams,
  query: emptyQuery,
});

module.exports = {
  createProposalSchema,
  listErrandProposalsSchema,
  listTripProposalsSchema,
  proposalActionSchema,
};
