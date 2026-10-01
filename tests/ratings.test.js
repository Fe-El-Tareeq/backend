process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

jest.mock("../src/features/ratings/ratings.repository");
jest.mock("../src/features/badges/badges.service");
const repository = require("../src/features/ratings/ratings.repository");
const badgeService = require("../src/features/badges/badges.service");
const service = require("../src/features/ratings/ratings.service");

const requesterId = "550e8400-e29b-41d4-a716-446655440000";
const travelerId = "550e8400-e29b-41d4-a716-446655440001";
const assignmentId = "850e8400-e29b-41d4-a716-446655440000";
const tx = { tx: true };
const assignment = {
  id: assignmentId,
  status: "COMPLETED",
  travelerId,
  traveler: { id: travelerId, fullName: "Traveler" },
  errand: {
    requesterId,
    requester: { id: requesterId, fullName: "Requester" },
    title: "Medicine",
  },
};
const input = {
  assignmentId,
  ratingStars: 5,
  comments: "Excellent",
  feedbackTags: ["ON_TIME"],
  paymentModalityConfirmed: "CASH",
};
const rating = {
  id: "rating-1",
  reviewerId: requesterId,
  reviewedUserId: travelerId,
  ...input,
  feedbackTags: [{ tag: "ON_TIME" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  repository.runTransaction.mockImplementation((callback) => callback(tx));
  repository.findAssignmentForRating.mockResolvedValue(assignment);
  repository.findRatingByAssignmentAndReviewer.mockResolvedValue(null);
  repository.lockUser.mockResolvedValue([{ id: travelerId }]);
  repository.createRating.mockResolvedValue(rating);
  repository.aggregateReceivedRatings.mockResolvedValue({
    _avg: { ratingStars: 5 },
    _sum: { ratingStars: 5 },
    _count: { _all: 1 },
  });
  repository.updateTrustScore.mockResolvedValue({
    id: travelerId,
    trustScore: 75,
  });
  badgeService.evaluateAndAward.mockResolvedValue([]);
});

describe("Ratings service", () => {
  test("calculates the approved Bayesian trust score", () => {
    expect(
      service.calculateTrustScore({ ratingCount: 1, ratingStarsSum: 5 }),
    ).toBe(75);
    expect(
      service.calculateTrustScore({ ratingCount: 1, ratingStarsSum: 1 }),
    ).toBeCloseTo(61.67, 2);
  });

  test("requester rates traveler after completion and updates trust atomically", async () => {
    const result = await service.createRating(requesterId, input);
    expect(result.created).toBe(true);
    expect(repository.createRating).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerId: requesterId,
        reviewedUserId: travelerId,
      }),
      tx,
    );
    expect(repository.updateTrustScore).toHaveBeenCalledWith(
      travelerId,
      75,
      tx,
    );
    expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(travelerId, tx);
  });

  test("traveler rates requester", async () => {
    repository.createRating.mockResolvedValue({
      ...rating,
      reviewerId: travelerId,
      reviewedUserId: requesterId,
    });
    await service.createRating(travelerId, input);
    expect(repository.createRating).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerId: travelerId,
        reviewedUserId: requesterId,
      }),
      tx,
    );
  });

  test("rejects ratings before completion and by outsiders", async () => {
    repository.findAssignmentForRating.mockResolvedValueOnce({
      ...assignment,
      status: "IN_TRANSIT",
    });
    await expect(
      service.createRating(requesterId, input),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.createRating("550e8400-e29b-41d4-a716-446655440099", input),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("replays identical submissions but rejects a changed second rating", async () => {
    repository.findRatingByAssignmentAndReviewer.mockResolvedValue(rating);
    await expect(
      service.createRating(requesterId, input),
    ).resolves.toMatchObject({ created: false, rating });
    await expect(
      service.createRating(requesterId, { ...input, ratingStars: 4 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("returns pending rating prompts with the correct counterpart", async () => {
    repository.listPending.mockResolvedValue([assignment]);
    repository.countPending.mockResolvedValue(1);
    const result = await service.getPending(requesterId, { skip: 0, take: 20 });
    expect(result.pendingRatings[0]).toMatchObject({
      assignmentId,
      reviewedRole: "TRAVELER",
      reviewedUser: assignment.traveler,
    });
  });

  test("protects assignment ratings from nonparticipants", async () => {
    await expect(
      service.getAssignmentRatings(
        "550e8400-e29b-41d4-a716-446655440099",
        assignmentId,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("Badge rules", () => {
  test("awards each approved badge only when its threshold is met", () => {
    const { eligibleBadgeNames } = jest.requireActual(
      "../src/features/badges/badges.service",
    );
    expect(
      eligibleBadgeNames({
        completedDeliveries: 10,
        ratingCount: 10,
        averageRating: 4.6,
        trustScore: 91,
      }),
    ).toEqual([
      "First Delivery",
      "Helpful Neighbor",
      "Trusted Traveler",
      "Top Rated",
    ]);
  });
});
