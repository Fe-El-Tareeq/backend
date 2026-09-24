process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.NODE_ENV = "test";

jest.mock("../src/features/trips/trips.repository");
jest.mock("../src/features/deliveryPricing/deliveryPricing.service");

const repository = require("../src/features/trips/trips.repository");
const service = require("../src/features/trips/trips.service");

const travelerId = "550e8400-e29b-41d4-a716-446655440000";
const otherUserId = "550e8400-e29b-41d4-a716-446655440001";
const tripId = "880e8400-e29b-41d4-a716-446655440000";

const categories = {
  food: { id: "60a32850-bd3f-444a-84b4-c750abf6ecb1", name: "Food", icon: "food" },
  medicine: {
    id: "60a32850-bd3f-444a-84b4-c750abf6ecb2",
    name: "Medicine",
    icon: "medicine",
  },
};

const item = (id, name, category, overrides = {}) => ({
  id,
  name,
  description: `${name} description`,
  quantity: 1,
  size: "SMALL",
  isUrgent: false,
  itemNote: null,
  category,
  ...overrides,
});

const assignment = (id, status, errandId, items) => ({
  id,
  status,
  errand: { id: errandId, items },
});

const trip = (assignments = [], overrides = {}) => ({
  id: tripId,
  travelerId,
  assignments,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Trip execution checklist", () => {
  test("returns 404 when the trip does not exist", async () => {
    repository.findChecklistById.mockResolvedValue(null);

    await expect(service.getTripChecklist(travelerId, tripId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Trip not found.",
    });
  });

  test("rejects access by a user who does not own the trip", async () => {
    repository.findChecklistById.mockResolvedValue(trip());

    await expect(service.getTripChecklist(otherUserId, tripId)).rejects.toMatchObject({
      statusCode: 403,
      message: "Only the trip owner can view its checklist.",
    });
  });

  test("returns an empty zero-progress checklist when no assignment exists", async () => {
    repository.findChecklistById.mockResolvedValue(
      trip([], {
        proposals: [
          { status: "PENDING" },
          { status: "REJECTED" },
        ],
      }),
    );

    await expect(service.getTripChecklist(travelerId, tripId)).resolves.toEqual({
      tripId,
      progress: { completed: 0, total: 0, percentage: 0 },
      categories: [],
    });
  });

  test("returns every item from multiple assigned errands grouped deterministically", async () => {
    repository.findChecklistById.mockResolvedValue(
      trip([
        assignment("assignment-b", "ACCEPTED", "errand-b", [
          item("item-water", "Water", categories.food, { quantity: 3 }),
          item("item-bandage", "Bandage", categories.medicine),
        ]),
        assignment("assignment-a", "ACCEPTED", "errand-a", [
          item("item-apple", "Apple", categories.food),
        ]),
      ]),
    );

    const result = await service.getTripChecklist(travelerId, tripId);

    expect(result.categories.map((group) => group.category.name)).toEqual([
      "Food",
      "Medicine",
    ]);
    expect(result.categories[0].items.map((entry) => entry.name)).toEqual([
      "Apple",
      "Water",
    ]);
    expect(result.categories.flatMap((group) => group.items)).toHaveLength(3);
    expect(result.categories[0].items[1]).toMatchObject({
      itemId: "item-water",
      quantity: 3,
      errandId: "errand-b",
      assignmentId: "assignment-b",
    });
    expect(result.progress).toEqual({ completed: 0, total: 3, percentage: 0 });
  });

  test("derives pickup and delivery state from the assignment lifecycle", async () => {
    repository.findChecklistById.mockResolvedValue(
      trip([
        assignment("accepted", "ACCEPTED", "errand-1", [
          item("item-1", "Accepted", categories.food),
        ]),
        assignment("picked-up", "PICKED_UP", "errand-2", [
          item("item-2", "Picked up", categories.food),
        ]),
        assignment("in-transit", "IN_TRANSIT", "errand-3", [
          item("item-3", "In transit", categories.food),
        ]),
        assignment("completed", "COMPLETED", "errand-4", [
          item("item-4", "Completed", categories.food),
        ]),
        assignment("cancelled", "CANCELLED", "errand-5", [
          item("item-5", "Cancelled", categories.food),
        ]),
      ]),
    );

    const result = await service.getTripChecklist(travelerId, tripId);
    const byStatus = Object.fromEntries(
      result.categories[0].items.map((entry) => [entry.status, entry]),
    );

    expect(byStatus.ACCEPTED).toMatchObject({ pickedUp: false, delivered: false });
    expect(byStatus.PICKED_UP).toMatchObject({ pickedUp: true, delivered: false });
    expect(byStatus.IN_TRANSIT).toMatchObject({ pickedUp: true, delivered: false });
    expect(byStatus.COMPLETED).toMatchObject({ pickedUp: true, delivered: true });
    expect(byStatus.CANCELLED).toMatchObject({ pickedUp: false, delivered: false });
    expect(result.progress).toEqual({ completed: 1, total: 4, percentage: 25 });
  });

  test("reports full delivered progress as 100 percent", async () => {
    repository.findChecklistById.mockResolvedValue(
      trip([
        assignment("assignment-a", "COMPLETED", "errand-a", [
          item("item-1", "First", categories.food),
          item("item-2", "Second", categories.medicine),
        ]),
      ]),
    );

    const result = await service.getTripChecklist(travelerId, tripId);

    expect(result.progress).toEqual({ completed: 2, total: 2, percentage: 100 });
    expect(repository.findChecklistById).toHaveBeenCalledTimes(1);
  });
});
