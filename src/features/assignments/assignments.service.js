const { randomUUID } = require("crypto");

const ApiError = require("../../utils/ApiError");
const walletService = require("../wallet/wallet.service");
const badgeService = require("../badges/badges.service");
const { compatibleAreaKeys } = require("../matching/matching.service");
const { WEIGHT_CLASS_UNITS } = require("../matching/matching.constants");
const repository = require("./assignments.repository");
const { ACCEPT_TOKEN_COST } = require("./assignments.constants");

const isUniqueConflict = (error) =>
  error?.code === "P2002" ||
  error?.message?.includes("one_active_assignment_per_errand");

const assertUsableAreaPair = (resource, label) => {
  if (!resource.neighborhood?.key || !resource.destinationNeighborhood?.key) {
    throw new ApiError(
      400,
      `${label} must have active origin and destination neighborhoods.`,
    );
  }
};

const assertSameOrNearby = (sourceKey, candidateKey, label) => {
  if (!compatibleAreaKeys(sourceKey).includes(candidateKey)) {
    throw new ApiError(
      400,
      `${label} neighborhoods are not compatible for assignment.`,
    );
  }
};

const requiredCapacityUnitsFor = (errand) =>
  WEIGHT_CLASS_UNITS[errand.weightClass];

const assertCompatiblePair = ({ errand, trip, travelerId, now }) => {
  if (!errand) {
    throw new ApiError(404, "Errand not found.");
  }

  if (!trip) {
    throw new ApiError(404, "Trip not found.");
  }

  if (trip.travelerId !== travelerId) {
    throw new ApiError(
      403,
      "Only the trip owner can accept an assignment for this trip.",
    );
  }

  if (errand.requesterId === travelerId) {
    throw new ApiError(400, "Travelers cannot accept their own errand.");
  }

  if (errand.status !== "OPEN" || errand.expiresAt <= now) {
    throw new ApiError(409, "Errand is no longer available for assignment.");
  }

  if (
    trip.status !== "ACTIVE" ||
    trip.expiresAt <= now ||
    trip.departureTime <= now ||
    !trip.expectedReturnTime
  ) {
    throw new ApiError(400, "Trip is not available for assignment.");
  }

  assertUsableAreaPair(errand, "Errand");
  assertUsableAreaPair(trip, "Trip");
  assertSameOrNearby(errand.neighborhood.key, trip.neighborhood.key, "Origin");
  assertSameOrNearby(
    errand.destinationNeighborhood.key,
    trip.destinationNeighborhood.key,
    "Destination",
  );

  const deadline = errand.neededByTime || errand.expiresAt;
  if (new Date(trip.expectedReturnTime) > new Date(deadline)) {
    throw new ApiError(400, "Trip return time is after the errand deadline.");
  }

  const requiredCapacityUnits = requiredCapacityUnitsFor(errand);
  if (WEIGHT_CLASS_UNITS[trip.maxCapacityClass] < requiredCapacityUnits) {
    throw new ApiError(400, "Trip capacity class cannot carry this errand.");
  }

  if (trip.remainingCapacityUnits < requiredCapacityUnits) {
    throw new ApiError(400, "Trip does not have enough remaining capacity.");
  }

  return { requiredCapacityUnits };
};

const assertParticipant = (assignment, userId) => {
  if (
    assignment.travelerId !== userId &&
    assignment.errand.requesterId !== userId
  ) {
    throw new ApiError(403, "You are not allowed to access this assignment.");
  }
};

const assertTraveler = (assignment, userId, action) => {
  if (assignment.travelerId !== userId) {
    throw new ApiError(403, `Only the traveler can ${action}.`);
  }
};

const assertRequester = (assignment, userId, action) => {
  if (assignment.errand.requesterId !== userId) {
    throw new ApiError(403, `Only the requester can ${action}.`);
  }
};

const assertStatus = (assignment, expected, message) => {
  if (assignment.status !== expected) {
    throw new ApiError(400, message);
  }
};

const createAssignment = async (travelerId, { errandId, tripId }) => {
  try {
    return await repository.runTransaction(async (tx) => {
      const now = new Date();
      const errand = await repository.findErrandForAccept(errandId, tx);
      const trip = await repository.findTripForAccept(tripId, tx);
      const { requiredCapacityUnits } = assertCompatiblePair({
        errand,
        trip,
        travelerId,
        now,
      });

      const existingAssignment = await repository.findActiveAssignmentForErrand(
        errandId,
        tx,
      );
      if (existingAssignment) {
        if (
          existingAssignment.travelerId === travelerId &&
          existingAssignment.tripId === tripId
        ) {
          return existingAssignment;
        }
        throw new ApiError(409, "Errand already has an active assignment.");
      }

      const assignmentId = randomUUID();
      const debit = await walletService.debit({
        userId: travelerId,
        amount: ACCEPT_TOKEN_COST,
        transactionType: "ERRAND_ACCEPT_DEBIT",
        referenceType: "ASSIGNMENT",
        referenceId: assignmentId,
        idempotencyKey: `assignment-accept:${travelerId}:${errandId}:${tripId}`,
        description: "Assignment acceptance token debit",
        client: tx,
      });

      const assignment = await repository.createAssignment(
        {
          id: assignmentId,
          errandId,
          travelerId,
          tripId,
          acceptanceSource: "TRIP_MATCH",
          agreedDeliveryFeeNis: trip.deliveryFeeNis,
          pricingVersion: trip.pricingVersion,
          acceptTokenTransactionId: debit.id,
          status: "ACCEPTED",
        },
        tx,
      );

      await repository.updateTripCapacity(
        tripId,
        trip.remainingCapacityUnits - requiredCapacityUnits,
        tx,
      );
      await repository.updateErrandStatus(errandId, "MATCHED", tx);
      await repository.markMatchAcceptedIfPresent(
        { errandId, tripId, acceptedAt: now },
        tx,
      );
      await repository.createChatRoom(assignmentId, tx);

      return repository.findAssignmentById(assignmentId, tx);
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new ApiError(409, "Errand already has an active assignment.");
    }
    throw error;
  }
};

const listAssignments = async (userId, { skip = 0, take = 20 } = {}) => {
  const [assignments, total] = await Promise.all([
    repository.listAssignmentsForUser({ userId, skip, take }),
    repository.countAssignmentsForUser(userId),
  ]);

  return {
    assignments,
    pagination: { skip, take, total },
  };
};

const getAssignmentById = async (userId, assignmentId) => {
  const assignment = await repository.findAssignmentById(assignmentId);
  if (!assignment) {
    throw new ApiError(404, "Assignment not found.");
  }
  assertParticipant(assignment, userId);
  return assignment;
};

const transitionAssignment = async ({
  userId,
  assignmentId,
  fromStatus,
  toStatus,
  timestampField,
  actor,
  actorAction,
  invalidMessage,
  updateErrandTo,
}) => {
  return repository.runTransaction(async (tx) => {
    const assignment = await repository.findAssignmentByIdForUpdate(
      assignmentId,
      tx,
    );
    if (!assignment) {
      throw new ApiError(404, "Assignment not found.");
    }

    assertParticipant(assignment, userId);
    if (actor === "traveler") {
      assertTraveler(assignment, userId, actorAction);
    } else {
      assertRequester(assignment, userId, actorAction);
    }
    assertStatus(assignment, fromStatus, invalidMessage);

    const updated = await repository.updateAssignment(
      assignmentId,
      {
        status: toStatus,
        [timestampField]: new Date(),
      },
      tx,
    );

    if (updateErrandTo) {
      await repository.updateErrandStatus(
        assignment.errandId,
        updateErrandTo,
        tx,
      );
      const result = await repository.findAssignmentById(assignmentId, tx);
      if (toStatus === "COMPLETED") {
        await badgeService.evaluateAndAward(assignment.travelerId, tx);
        return {
          ...result,
          ratingPrompt: {
            required: true,
            assignmentId,
            reviewedUser: result.traveler,
            reviewedRole: "TRAVELER",
          },
        };
      }
      return result;
    }

    return updated;
  });
};

const markPickedUp = (userId, assignmentId) =>
  transitionAssignment({
    userId,
    assignmentId,
    fromStatus: "ACCEPTED",
    toStatus: "PICKED_UP",
    timestampField: "pickedUpAt",
    actor: "traveler",
    actorAction: "mark this assignment as picked up",
    invalidMessage: "Only accepted assignments can be marked as picked up.",
  });

const startDelivery = (userId, assignmentId) =>
  transitionAssignment({
    userId,
    assignmentId,
    fromStatus: "PICKED_UP",
    toStatus: "IN_TRANSIT",
    timestampField: "inTransitAt",
    actor: "traveler",
    actorAction: "start delivery",
    invalidMessage: "Only picked up assignments can start delivery.",
  });

const completeAssignment = (userId, assignmentId) =>
  transitionAssignment({
    userId,
    assignmentId,
    fromStatus: "IN_TRANSIT",
    toStatus: "COMPLETED",
    timestampField: "completedAt",
    actor: "requester",
    actorAction: "complete this assignment",
    invalidMessage: "Only in-transit assignments can be completed.",
    updateErrandTo: "COMPLETED",
  });

const cancelAssignment = async (
  userId,
  assignmentId,
  { cancellationReason = null } = {},
) => {
  return repository.runTransaction(async (tx) => {
    const assignment = await repository.findAssignmentByIdForUpdate(
      assignmentId,
      tx,
    );
    if (!assignment) {
      throw new ApiError(404, "Assignment not found.");
    }

    assertParticipant(assignment, userId);
    assertStatus(
      assignment,
      "ACCEPTED",
      "Only accepted assignments can be cancelled.",
    );

    if (!assignment.tripId || !assignment.trip) {
      throw new ApiError(400, "Assignment is not linked to a trip.");
    }

    await repository.lockTrip?.(assignment.tripId, tx);
    const requiredCapacityUnits = requiredCapacityUnitsFor(assignment.errand);
    await repository.updateAssignment(
      assignmentId,
      {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: userId,
        cancellationReason,
      },
      tx,
    );
    await repository.restoreTripCapacity(
      assignment.tripId,
      requiredCapacityUnits,
      tx,
    );
    await repository.updateErrandStatus(assignment.errandId, "OPEN", tx);

    return repository.findAssignmentById(assignmentId, tx);
  });
};

module.exports = {
  assertCompatiblePair,
  createAssignment,
  listAssignments,
  getAssignmentById,
  markPickedUp,
  startDelivery,
  completeAssignment,
  cancelAssignment,
};
