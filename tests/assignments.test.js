process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const ApiError = require("../src/utils/ApiError");

jest.mock("../src/features/assignments/assignments.repository");
jest.mock("../src/features/wallet/wallet.service");

const repository = require("../src/features/assignments/assignments.repository");
const walletService = require("../src/features/wallet/wallet.service");
const service = require("../src/features/assignments/assignments.service");

const requesterId = "550e8400-e29b-41d4-a716-446655440000";
const travelerId = "550e8400-e29b-41d4-a716-446655440001";
const otherTravelerId = "550e8400-e29b-41d4-a716-446655440002";
const unrelatedUserId = "550e8400-e29b-41d4-a716-446655440003";
const errandId = "650e8400-e29b-41d4-a716-446655440000";
const tripId = "750e8400-e29b-41d4-a716-446655440000";
const assignmentId = "850e8400-e29b-41d4-a716-446655440000";
const walletTransactionId = "950e8400-e29b-41d4-a716-446655440000";

const area = (id, key) => ({ id, key, name: key, governorate: "Gaza" });
const origin = area("850e8400-e29b-41d4-a716-446655440001", "AN_NASER");
const destination = area("950e8400-e29b-41d4-a716-446655440001", "ASH_SHUJAIYEH");
const nowPlus = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

const makeErrand = (overrides = {}) => ({
  id: errandId,
  requesterId,
  neighborhood: origin,
  destinationNeighborhood: destination,
  weightClass: "LIGHT",
  isUrgent: false,
  status: "OPEN",
  neededByTime: nowPlus(8),
  expiresAt: nowPlus(8),
  requester: { id: requesterId, fullName: "Requester", trustScore: 80 },
  ...overrides,
});

const makeTrip = (overrides = {}) => ({
  id: tripId,
  travelerId,
  neighborhood: origin,
  destinationNeighborhood: destination,
  departureTime: nowPlus(1),
  expectedReturnTime: nowPlus(4),
  expiresAt: nowPlus(4),
  maxCapacityClass: "MEDIUM",
  maxCapacityUnits: 3,
  remainingCapacityUnits: 3,
  status: "ACTIVE",
  deliveryFeeNis: 5,
  pricingVersion: 1,
  traveler: { id: travelerId, fullName: "Traveler", trustScore: 80 },
  ...overrides,
});

const makeAssignment = (overrides = {}) => ({
  id: assignmentId,
  errandId,
  travelerId,
  tripId,
  acceptanceSource: "TRIP_MATCH",
  agreedDeliveryFeeNis: 5,
  pricingVersion: 1,
  acceptTokenTransactionId: walletTransactionId,
  status: "ACCEPTED",
  errand: makeErrand(),
  trip: makeTrip(),
  traveler: { id: travelerId, fullName: "Traveler", trustScore: 80 },
  chatRoom: { id: "chat-room-1", assignmentId },
  ...overrides,
});

const tx = { tx: true };

beforeEach(() => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) => callback(tx));
  repository.findErrandForAccept.mockResolvedValue(makeErrand());
  repository.findTripForAccept.mockResolvedValue(makeTrip());
  repository.findActiveAssignmentForErrand.mockResolvedValue(null);
  repository.createAssignment.mockResolvedValue(makeAssignment());
  repository.createChatRoom.mockResolvedValue({ id: "chat-room-1", assignmentId });
  repository.updateTripCapacity.mockResolvedValue(makeTrip({ remainingCapacityUnits: 2 }));
  repository.updateErrandStatus.mockResolvedValue(makeErrand({ status: "MATCHED" }));
  repository.markMatchAcceptedIfPresent.mockResolvedValue({ count: 0 });
  repository.findAssignmentById.mockResolvedValue(makeAssignment());
  repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment());
  repository.updateAssignment.mockResolvedValue(makeAssignment());
  repository.restoreTripCapacity.mockResolvedValue(makeTrip({ remainingCapacityUnits: 3 }));
  repository.listAssignmentsForUser.mockResolvedValue([makeAssignment()]);
  repository.countAssignmentsForUser.mockResolvedValue(1);
  repository.lockTrip.mockResolvedValue({ id: tripId });
  walletService.debit.mockResolvedValue({ id: walletTransactionId });
});

describe("Assignment accept flow", () => {
  test("traveler accepts a valid errand/trip pair successfully", async () => {
    const result = await service.createAssignment(travelerId, { errandId, tripId });

    expect(result.id).toBe(assignmentId);
    expect(walletService.debit).toHaveBeenCalledTimes(1);
    expect(walletService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: travelerId,
        amount: 1,
        transactionType: "ERRAND_ACCEPT_DEBIT",
        referenceType: "ASSIGNMENT",
        description: "Assignment acceptance token debit",
        client: tx,
      }),
    );
    const debitReferenceId = walletService.debit.mock.calls[0][0].referenceId;
    expect(repository.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: debitReferenceId,
        errandId,
        tripId,
        travelerId,
        acceptTokenTransactionId: walletTransactionId,
        status: "ACCEPTED",
      }),
      tx,
    );
    expect(repository.updateTripCapacity).toHaveBeenCalledWith(tripId, 2, tx);
    expect(repository.updateErrandStatus).toHaveBeenCalledWith(errandId, "MATCHED", tx);
    expect(repository.createChatRoom).toHaveBeenCalledWith(debitReferenceId, tx);
  });

  test("non-trip-owner cannot accept using another traveler's trip", async () => {
    await expect(
      service.createAssignment(otherTravelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(walletService.debit).not.toHaveBeenCalled();
    expect(repository.createAssignment).not.toHaveBeenCalled();
  });

  test("invalid or nonexistent match pair is rejected", async () => {
    repository.findErrandForAccept.mockResolvedValue(null);

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Errand not found." });
  });

  test("already assigned errand returns a 409 for another traveler", async () => {
    repository.findActiveAssignmentForErrand.mockResolvedValue(
      makeAssignment({ travelerId: otherTravelerId, trip: makeTrip({ travelerId: otherTravelerId }) }),
    );

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("duplicate retry by the same traveler returns the existing assignment without another debit", async () => {
    const existing = makeAssignment();
    repository.findActiveAssignmentForErrand.mockResolvedValue(existing);

    const result = await service.createAssignment(travelerId, { errandId, tripId });

    expect(result).toBe(existing);
    expect(walletService.debit).not.toHaveBeenCalled();
    expect(repository.createAssignment).not.toHaveBeenCalled();
  });

  test("inactive or expired trips are rejected", async () => {
    repository.findTripForAccept.mockResolvedValue(makeTrip({ status: "CANCELLED" }));

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("insufficient capacity is rejected", async () => {
    repository.findTripForAccept.mockResolvedValue(makeTrip({ remainingCapacityUnits: 0 }));

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("incompatible errand and trip deadline is rejected", async () => {
    repository.findTripForAccept.mockResolvedValue(makeTrip({ expectedReturnTime: nowPlus(10) }));

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("insufficient wallet tokens prevents assignment creation", async () => {
    walletService.debit.mockRejectedValue(new ApiError(400, "Insufficient token balance"));

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createAssignment).not.toHaveBeenCalled();
    expect(repository.updateTripCapacity).not.toHaveBeenCalled();
  });

  test("concurrent double accept maps the database unique conflict to 409", async () => {
    repository.createAssignment.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "P2002" }),
    );

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("chat room creation failure rolls back the transaction path", async () => {
    repository.createChatRoom.mockRejectedValue(new Error("chat failed"));

    await expect(
      service.createAssignment(travelerId, { errandId, tripId }),
    ).rejects.toThrow("chat failed");
    expect(walletService.debit).toHaveBeenCalledWith(expect.objectContaining({ client: tx }));
    expect(repository.createAssignment).toHaveBeenCalled();
  });
});

describe("Assignment lifecycle transitions", () => {
  test("traveler can mark accepted assignment as picked up", async () => {
    repository.updateAssignment.mockResolvedValue(makeAssignment({ status: "PICKED_UP" }));

    const result = await service.markPickedUp(travelerId, assignmentId);

    expect(result.status).toBe("PICKED_UP");
    expect(repository.updateAssignment).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({ status: "PICKED_UP", pickedUpAt: expect.any(Date) }),
      tx,
    );
  });

  test("requester cannot mark picked up", async () => {
    await expect(service.markPickedUp(requesterId, assignmentId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("traveler can mark in transit only after picked up", async () => {
    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "PICKED_UP" }));
    repository.updateAssignment.mockResolvedValue(makeAssignment({ status: "IN_TRANSIT" }));

    await expect(service.startDelivery(travelerId, assignmentId)).resolves.toMatchObject({
      status: "IN_TRANSIT",
    });
  });

  test("cannot start delivery from accepted", async () => {
    await expect(service.startDelivery(travelerId, assignmentId)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test("requester can complete only after in transit and errand becomes completed", async () => {
    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "IN_TRANSIT" }));
    repository.updateAssignment.mockResolvedValue(makeAssignment({ status: "COMPLETED" }));
    repository.findAssignmentById.mockResolvedValue(makeAssignment({ status: "COMPLETED" }));

    const result = await service.completeAssignment(requesterId, assignmentId);

    expect(result.status).toBe("COMPLETED");
    expect(repository.updateErrandStatus).toHaveBeenCalledWith(errandId, "COMPLETED", tx);
  });

  test("traveler cannot complete", async () => {
    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "IN_TRANSIT" }));

    await expect(service.completeAssignment(travelerId, assignmentId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("cannot transition completed or cancelled assignments again", async () => {
    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "COMPLETED" }));
    await expect(service.markPickedUp(travelerId, assignmentId)).rejects.toMatchObject({ statusCode: 400 });

    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));
    await expect(service.startDelivery(travelerId, assignmentId)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("Assignment cancellation and reads", () => {
  test("requester can cancel while accepted, restoring capacity and reopening errand", async () => {
    repository.updateAssignment.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));
    repository.findAssignmentById.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));

    const result = await service.cancelAssignment(requesterId, assignmentId, {
      cancellationReason: "Plans changed",
    });

    expect(result.status).toBe("CANCELLED");
    expect(repository.restoreTripCapacity).toHaveBeenCalledWith(tripId, 1, tx);
    expect(repository.updateErrandStatus).toHaveBeenCalledWith(errandId, "OPEN", tx);
    expect(walletService.debit).not.toHaveBeenCalled();
    expect(walletService.refund).not.toHaveBeenCalled();
  });

  test("traveler can cancel while accepted", async () => {
    repository.updateAssignment.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));
    repository.findAssignmentById.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));

    await expect(service.cancelAssignment(travelerId, assignmentId)).resolves.toMatchObject({
      status: "CANCELLED",
    });
  });

  test("cannot cancel after picked up or cancel repeatedly", async () => {
    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "PICKED_UP" }));

    await expect(service.cancelAssignment(requesterId, assignmentId)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.restoreTripCapacity).not.toHaveBeenCalled();

    repository.findAssignmentByIdForUpdate.mockResolvedValue(makeAssignment({ status: "CANCELLED" }));
    await expect(service.cancelAssignment(requesterId, assignmentId)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.restoreTripCapacity).not.toHaveBeenCalled();
  });

  test("unrelated user cannot read assignment", async () => {
    await expect(service.getAssignmentById(unrelatedUserId, assignmentId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("list only asks for assignments related to the current user", async () => {
    const result = await service.listAssignments(travelerId, { skip: 5, take: 10 });

    expect(result.pagination).toEqual({ skip: 5, take: 10, total: 1 });
    expect(repository.listAssignmentsForUser).toHaveBeenCalledWith({
      userId: travelerId,
      skip: 5,
      take: 10,
    });
  });
});
