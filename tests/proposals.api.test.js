process.env.NODE_ENV = "test";
const request = require("supertest");

jest.mock("../src/features/proposals/proposals.service");
jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: "550e8400-e29b-41d4-a716-446655440001" };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
}));

const app = require("../src/app");
const service = require("../src/features/proposals/proposals.service");
const userId = "550e8400-e29b-41d4-a716-446655440001";
const errandId = "650e8400-e29b-41d4-a716-446655440000";
const tripId = "750e8400-e29b-41d4-a716-446655440000";
const proposalId = "850e8400-e29b-41d4-a716-446655440000";
const clientRequestKey = "950e8400-e29b-41d4-a716-446655440000";

beforeEach(() => jest.clearAllMocks());

test("POST /api/v1/proposals validates and creates a proposal", async () => {
  service.createProposal.mockResolvedValue({
    created: true,
    proposal: { id: proposalId },
  });
  const response = await request(app).post("/api/v1/proposals").send({
    errandId,
    tripId,
    clientRequestKey,
    type: "TRAVELER_OFFER",
    message: "Available",
  });
  expect(response.statusCode).toBe(201);
  expect(service.createProposal).toHaveBeenCalledWith(
    userId,
    expect.objectContaining({ type: "TRAVELER_OFFER" }),
  );
});

test("proposal inbox endpoints pass filters", async () => {
  service.listErrandProposals.mockResolvedValue({
    proposals: [],
    summary: {},
    pagination: {},
  });
  service.listTripProposals.mockResolvedValue({
    proposals: [],
    summary: {},
    pagination: {},
  });
  expect(
    (
      await request(app).get(
        `/api/v1/errands/${errandId}/proposals?status=PENDING`,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await request(app).get(
        `/api/v1/trips/${tripId}/proposals?status=REJECTED`,
      )
    ).statusCode,
  ).toBe(200);
  expect(service.listErrandProposals).toHaveBeenCalledWith(
    userId,
    errandId,
    expect.objectContaining({ status: "PENDING" }),
  );
});

test("accept and reject endpoints call proposal decisions", async () => {
  service.acceptProposal.mockResolvedValue({
    proposal: { id: proposalId },
    assignment: { id: "assignment" },
  });
  service.rejectProposal.mockResolvedValue({
    id: proposalId,
    status: "REJECTED",
  });
  expect(
    (await request(app).post(`/api/v1/proposals/${proposalId}/accept`))
      .statusCode,
  ).toBe(200);
  expect(
    (await request(app).post(`/api/v1/proposals/${proposalId}/reject`))
      .statusCode,
  ).toBe(200);
});

test("invalid status filter is rejected", async () => {
  const response = await request(app).get(
    `/api/v1/errands/${errandId}/proposals?status=EXPIRED`,
  );
  expect(response.statusCode).toBe(400);
  expect(service.listErrandProposals).not.toHaveBeenCalled();
});
