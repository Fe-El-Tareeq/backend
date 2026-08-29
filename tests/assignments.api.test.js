process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../src/features/assignments/assignments.service");
jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: "550e8400-e29b-41d4-a716-446655440001" };
    next();
  },
}));

const app = require("../src/app");
const service = require("../src/features/assignments/assignments.service");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const assignmentId = "850e8400-e29b-41d4-a716-446655440000";
const errandId = "650e8400-e29b-41d4-a716-446655440000";
const tripId = "750e8400-e29b-41d4-a716-446655440000";
const assignment = { id: assignmentId, errandId, tripId, travelerId: userId, status: "ACCEPTED" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Assignments API", () => {
  test("POST /api/v1/assignments accepts an assignment", async () => {
    service.createAssignment.mockResolvedValue(assignment);

    const response = await request(app).post("/api/v1/assignments").send({ errandId, tripId });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.assignment).toMatchObject(assignment);
    expect(service.createAssignment).toHaveBeenCalledWith(userId, { errandId, tripId });
  });

  test("POST /api/v1/assignments rejects invalid IDs", async () => {
    const response = await request(app).post("/api/v1/assignments").send({
      errandId: "bad",
      tripId,
    });

    expect(response.statusCode).toBe(400);
    expect(service.createAssignment).not.toHaveBeenCalled();
  });

  test("GET /api/v1/assignments lists assignments", async () => {
    service.listAssignments.mockResolvedValue({
      assignments: [assignment],
      pagination: { skip: 0, take: 20, total: 1 },
    });

    const response = await request(app).get("/api/v1/assignments");

    expect(response.statusCode).toBe(200);
    expect(service.listAssignments).toHaveBeenCalledWith(userId, { skip: 0, take: 20 });
  });

  test("GET /api/v1/assignments/:id returns details", async () => {
    service.getAssignmentById.mockResolvedValue(assignment);

    const response = await request(app).get(`/api/v1/assignments/${assignmentId}`);

    expect(response.statusCode).toBe(200);
    expect(service.getAssignmentById).toHaveBeenCalledWith(userId, assignmentId);
  });

  test("explicit lifecycle action endpoints call the matching service methods", async () => {
    service.markPickedUp.mockResolvedValue({ ...assignment, status: "PICKED_UP" });
    service.startDelivery.mockResolvedValue({ ...assignment, status: "IN_TRANSIT" });
    service.completeAssignment.mockResolvedValue({ ...assignment, status: "COMPLETED" });
    service.cancelAssignment.mockResolvedValue({ ...assignment, status: "CANCELLED" });

    expect((await request(app).post(`/api/v1/assignments/${assignmentId}/pickup`)).statusCode).toBe(200);
    expect((await request(app).post(`/api/v1/assignments/${assignmentId}/start-delivery`)).statusCode).toBe(200);
    expect((await request(app).post(`/api/v1/assignments/${assignmentId}/complete`)).statusCode).toBe(200);
    expect((await request(app).post(`/api/v1/assignments/${assignmentId}/cancel`).send({ cancellationReason: "Changed" })).statusCode).toBe(200);

    expect(service.markPickedUp).toHaveBeenCalledWith(userId, assignmentId);
    expect(service.startDelivery).toHaveBeenCalledWith(userId, assignmentId);
    expect(service.completeAssignment).toHaveBeenCalledWith(userId, assignmentId);
    expect(service.cancelAssignment).toHaveBeenCalledWith(userId, assignmentId, { cancellationReason: "Changed" });
  });
});
