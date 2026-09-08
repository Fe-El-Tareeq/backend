process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

jest.mock("../src/features/proposals/proposals.repository");
jest.mock("../src/features/assignments/assignments.service", () => ({
  assertCompatiblePair: jest.fn(),
  createAssignmentInTransaction: jest.fn(),
}));

const repository = require("../src/features/proposals/proposals.repository");
const assignmentService = require("../src/features/assignments/assignments.service");
const service = require("../src/features/proposals/proposals.service");

const requesterId = "550e8400-e29b-41d4-a716-446655440000";
const travelerId = "550e8400-e29b-41d4-a716-446655440001";
const errandId = "650e8400-e29b-41d4-a716-446655440000";
const tripId = "750e8400-e29b-41d4-a716-446655440000";
const proposalId = "850e8400-e29b-41d4-a716-446655440000";
const key = "950e8400-e29b-41d4-a716-446655440000";
const future = () => new Date(Date.now() + 60 * 60 * 1000);
const area = { id: "a", key: "AN_NASER", name: "النصر", governorate: "Gaza" };

const errand = {
  id: errandId,
  requesterId,
  status: "OPEN",
  expiresAt: future(),
  neighborhood: area,
  destinationNeighborhood: area,
};
const trip = {
  id: tripId,
  travelerId,
  status: "ACTIVE",
  expiresAt: future(),
  departureTime: future(),
  expectedReturnTime: future(),
  neighborhood: area,
  destinationNeighborhood: area,
};
const proposal = (overrides = {}) => ({
  id: proposalId,
  errandId,
  tripId,
  initiatedById: travelerId,
  clientRequestKey: key,
  type: "TRAVELER_OFFER",
  status: "PENDING",
  message: "I can deliver it",
  expiresAt: future(),
  errand: { ...errand, requester: { id: requesterId } },
  trip: { ...trip, traveler: { id: travelerId, _count: { assignments: 2 } } },
  initiatedBy: { id: travelerId, _count: { assignments: 2 } },
  ...overrides,
});
const tx = { tx: true };

beforeEach(() => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) => callback(tx));
  repository.findErrand.mockResolvedValue(errand);
  repository.findTrip.mockResolvedValue(trip);
  repository.findByInitiatorAndKey.mockResolvedValue(null);
  repository.create.mockResolvedValue(proposal());
  repository.lockById.mockResolvedValue(proposal());
  repository.update.mockImplementation(async (_id, data) => proposal(data));
  repository.rejectOtherPendingForErrand.mockResolvedValue({ count: 2 });
  assignmentService.createAssignmentInTransaction.mockResolvedValue({
    id: "assignment",
    status: "ACCEPTED",
  });
});

describe("Proposal creation", () => {
  test("trip owner sends a traveler offer without token debit or assignment creation", async () => {
    const result = await service.createProposal(travelerId, {
      errandId,
      tripId,
      clientRequestKey: key,
      type: "TRAVELER_OFFER",
      message: " I can deliver it ",
    });
    expect(result.created).toBe(true);
    expect(result.proposal.initiatedBy.completedDeliveries).toBe(2);
    expect(assignmentService.assertCompatiblePair).toHaveBeenCalled();
    expect(
      assignmentService.createAssignmentInTransaction,
    ).not.toHaveBeenCalled();
  });

  test("errand owner sends a requester request", async () => {
    repository.create.mockResolvedValue(
      proposal({ initiatedById: requesterId, type: "REQUESTER_REQUEST" }),
    );
    await expect(
      service.createProposal(requesterId, {
        errandId,
        tripId,
        clientRequestKey: key,
        type: "REQUESTER_REQUEST",
      }),
    ).resolves.toMatchObject({ created: true });
  });

  test("rejects an actor who does not own the required resource", async () => {
    await expect(
      service.createProposal(requesterId, {
        errandId,
        tripId,
        clientRequestKey: key,
        type: "TRAVELER_OFFER",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("Proposal inbox and decisions", () => {
  test("returns filtered proposals, counts and pagination to the errand owner", async () => {
    repository.list.mockResolvedValue([proposal()]);
    repository.count.mockResolvedValue(1);
    repository.countByStatus.mockResolvedValue([
      { status: "PENDING", _count: { _all: 4 } },
      { status: "ACCEPTED", _count: { _all: 0 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ]);
    const result = await service.listErrandProposals(requesterId, errandId, {
      status: "PENDING",
      skip: 0,
      take: 20,
    });
    expect(result.summary).toEqual({
      total: 5,
      pending: 4,
      accepted: 0,
      rejected: 1,
    });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { errandId, type: "TRAVELER_OFFER", status: "PENDING" },
        skip: 0,
        take: 20,
      }),
    );
  });

  test("receiver acceptance creates assignment and rejects only other proposals for the same errand", async () => {
    const result = await service.acceptProposal(requesterId, proposalId);
    expect(result.assignment.status).toBe("ACCEPTED");
    expect(
      assignmentService.createAssignmentInTransaction,
    ).toHaveBeenCalledWith(
      travelerId,
      { errandId, tripId, acceptanceSource: "PROPOSAL" },
      tx,
    );
    expect(repository.rejectOtherPendingForErrand).toHaveBeenCalledWith(
      errandId,
      proposalId,
      expect.any(Date),
      tx,
    );
  });

  test("receiver can reject pending proposal with a manual reason", async () => {
    const result = await service.rejectProposal(requesterId, proposalId);
    expect(result.status).toBe("REJECTED");
    expect(repository.update).toHaveBeenCalledWith(
      proposalId,
      expect.objectContaining({
        status: "REJECTED",
        rejectionReason: "REJECTED_BY_OWNER",
      }),
      tx,
    );
  });

  test("initiator cannot accept their own proposal", async () => {
    await expect(
      service.acceptProposal(travelerId, proposalId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("expired proposal is persisted as expired before returning conflict", async () => {
    repository.lockById.mockResolvedValue(
      proposal({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      service.acceptProposal(requesterId, proposalId),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Proposal has expired.",
    });
    expect(repository.update).toHaveBeenCalledWith(
      proposalId,
      { status: "EXPIRED" },
      tx,
    );
  });
});
