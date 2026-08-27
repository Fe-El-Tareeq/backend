process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.NODE_ENV = "test";

const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/features/errands/errands.repository");
jest.mock("../src/features/wallet/wallet.service");
jest.mock("../src/config/prisma", () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

const app = require("../src/app");
const repository = require("../src/features/errands/errands.repository");
const walletService = require("../src/features/wallet/wallet.service");
const prisma = require("../src/config/prisma");
const service = require("../src/features/errands/errands.service");

const tx = { tx: true };
const userId = "550e8400-e29b-41d4-a716-446655440000";
const otherUserId = "550e8400-e29b-41d4-a716-446655440001";
const categoryId = "60a32850-bd3f-444a-84b4-c750abf6ecb6";
const neighborhoodId = "60a32850-bd3f-444a-84b4-c750abf6ecb7";
const pickupNeighborhoodId = "60a32850-bd3f-444a-84b4-c750abf6ed00";
const clientRequestKey = "60a32850-bd3f-444a-84b4-c750abf6ecb8";
const errandId = "60a32850-bd3f-444a-84b4-c750abf6ecb9";
const transactionId = "60a32850-bd3f-444a-84b4-c750abf6eca0";

const accessToken = jwt.sign(
  {
    type: "access",
    userId,
    role: "USER",
  },
  process.env.JWT_ACCESS_SECRET,
);

const requester = {
  id: userId,
  fullName: "Leenah Alborsh",
  neighborhoodId,
  profileCompleted: true,
  phoneVerifiedAt: new Date(),
  status: "ACTIVE",
};

const category = {
  id: categoryId,
  name: "Medicine",
  priorityWeight: 5,
  icon: "medicine",
};

const createPayload = {
  clientRequestKey,
  categoryId,
  title: "Buy medicine",
  itemsDescription: "One box of Panadol",
  destinationKeyword: "Central Pharmacy",
  pickupNeighborhoodId,
  weightClass: "LIGHT",
  isUrgent: false,
  isInterZone: false,
  neededByTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  voiceNoteUrl: null,
  voiceNoteDurationSec: null,
};

const makeErrand = (overrides = {}) => ({
  id: errandId,
  requesterId: userId,
  categoryId,
  neighborhoodId,
  destinationNeighborhoodId: pickupNeighborhoodId,
  clientRequestKey,
  title: createPayload.title,
  itemsDescription: createPayload.itemsDescription,
  destinationKeyword: createPayload.destinationKeyword,
  weightClass: createPayload.weightClass,
  isUrgent: createPayload.isUrgent,
  isInterZone: createPayload.isInterZone,
  priorityScore: 8,
  calculatedFeeNis: 5,
  postTokenCost: 1,
  postTokenTransactionId: transactionId,
  voiceNoteUrl: null,
  voiceNoteDurationSec: null,
  status: "OPEN",
  neededByTime: new Date(createPayload.neededByTime),
  expiresAt: new Date(createPayload.neededByTime),
  createdAt: new Date(),
  updatedAt: new Date(),
  category,
  neighborhood: {
    id: neighborhoodId,
    name: "Al-Rimal",
    governorate: "Gaza",
  },
  requester: {
    id: userId,
    fullName: "Leenah Alborsh",
    trustScore: 70,
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    phone: "+970599000000",
    role: "USER",
    status: "ACTIVE",
  });

  repository.runTransaction.mockImplementation((callback) => callback(tx));
  repository.findByRequesterAndClientKey.mockResolvedValue(null);
  repository.findRequesterForPosting.mockResolvedValue(requester);
  repository.findActiveCategoryById.mockResolvedValue(category);
  repository.findActiveNeighborhoodById.mockResolvedValue({
    id: pickupNeighborhoodId,
    key: "ASH_SHUJAIYEH",
    name: "Ash Shujaiyeh",
    governorate: "Gaza",
  });
  repository.createErrand.mockImplementation(async (data) => makeErrand(data));
  repository.findById.mockResolvedValue(makeErrand());
  repository.updateErrand.mockImplementation(async (id, data) =>
    makeErrand({
      id,
      ...data,
    }),
  );
  repository.listErrands.mockResolvedValue([makeErrand()]);
  repository.countErrands.mockResolvedValue(1);
  walletService.debit.mockResolvedValue({
    id: transactionId,
    transactionType: "ERRAND_POST_DEBIT",
    tokenAmount: 1,
  });
});

describe("Errands create", () => {
  test("authenticated create succeeds and debits the wallet once", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(createPayload);

    expect(response.statusCode).toBe(201);
    expect(response.body.data.errand.postTokenTransactionId).toBe(transactionId);
    expect(response.body.data.errand.postTokenCost).toBe(1);
    expect(response.body.data.errand.passwordHash).toBeUndefined();
    expect(walletService.debit).toHaveBeenCalledTimes(1);
    expect(walletService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        amount: 1,
        transactionType: "ERRAND_POST_DEBIT",
        idempotencyKey: `errand-post:${userId}:${clientRequestKey}`,
        client: tx,
      }),
    );
    expect(repository.createErrand).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: userId,
        neighborhoodId,
        destinationNeighborhoodId: pickupNeighborhoodId,
        calculatedFeeNis: 5,
        priorityScore: 8,
        postTokenTransactionId: transactionId,
      }),
      tx,
    );
  });

  test("unauthenticated create is rejected", async () => {
    const response = await request(app).post("/api/v1/errands").send(createPayload);

    expect(response.statusCode).toBe(401);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("insufficient wallet balance is rejected and no errand is created", async () => {
    walletService.debit.mockRejectedValue({
      statusCode: 400,
      message: "Insufficient token balance",
      errors: [],
    });

    await expect(service.createErrand(userId, createPayload)).rejects.toMatchObject({
      statusCode: 400,
      message: "Insufficient token balance",
    });

    expect(repository.createErrand).not.toHaveBeenCalled();
  });

  test("duplicate clientRequestKey returns existing errand and does not debit again", async () => {
    const existingErrand = makeErrand();
    repository.findByRequesterAndClientKey.mockResolvedValue(existingErrand);

    const result = await service.createErrand(userId, createPayload);

    expect(result).toBe(existingErrand);
    expect(walletService.debit).not.toHaveBeenCalled();
    expect(repository.createErrand).not.toHaveBeenCalled();
  });

  test("conflicting clientRequestKey reuse is rejected", async () => {
    repository.findByRequesterAndClientKey.mockResolvedValue(
      makeErrand({
        title: "Different title",
      }),
    );

    await expect(service.createErrand(userId, createPayload)).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Client request key has already been used with different errand data.",
    });
  });

  test("invalid or inactive category is rejected", async () => {
    repository.findActiveCategoryById.mockResolvedValue(null);

    await expect(service.createErrand(userId, createPayload)).rejects.toMatchObject({
      statusCode: 400,
      message: "Selected category does not exist or is inactive.",
    });

    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("user without required neighborhood is rejected", async () => {
    repository.findRequesterForPosting.mockResolvedValue({
      ...requester,
      neighborhoodId: null,
      profileCompleted: false,
    });

    await expect(service.createErrand(userId, createPayload)).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Complete your profile and select a neighborhood before posting errands.",
    });
  });

  test("invalid weight class is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        weightClass: "TINY",
      });

    expect(response.statusCode).toBe(400);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("invalid voice duration is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        voiceNoteDurationSec: 31,
      });

    expect(response.statusCode).toBe(400);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("past neededByTime is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        neededByTime: new Date(Date.now() - 1000).toISOString(),
      });

    expect(response.statusCode).toBe(400);
  });

  test("urgent heavy inter-zone fee and priority are calculated", async () => {
    await service.createErrand(userId, {
      ...createPayload,
      weightClass: "HEAVY",
      isUrgent: true,
      isInterZone: true,
    });

    expect(repository.createErrand).toHaveBeenCalledWith(
      expect.objectContaining({
        calculatedFeeNis: 17,
        priorityScore: 18,
      }),
      tx,
    );
  });
});

describe("Errands list and detail", () => {
  test("list defaults to authenticated user's neighborhood and excludes expired OPEN errands", async () => {
    const response = await request(app)
      .get("/api/v1/errands?take=10")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          neighborhoodId,
          status: "OPEN",
          expiresAt: expect.objectContaining({
            gt: expect.any(Date),
          }),
        }),
        skip: 0,
        take: 10,
      }),
    );
  });

  test("list supports category and urgent filters with pagination", async () => {
    const response = await request(app).get(
      `/api/v1/errands?neighborhoodId=${neighborhoodId}&categoryId=${categoryId}&urgent=true&skip=1&take=5`,
    );

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          neighborhoodId,
          categoryId,
          isUrgent: true,
          status: "OPEN",
        }),
        skip: 1,
        take: 5,
      }),
    );
  });

  test("detail returns a safe errand view", async () => {
    const response = await request(app).get(`/api/v1/errands/${errandId}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.data.errand.requester.fullName).toBe("Leenah Alborsh");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("refreshToken");
  });

  test("invalid detail UUID is rejected", async () => {
    const response = await request(app).get("/api/v1/errands/not-a-uuid");

    expect(response.statusCode).toBe(400);
  });

  test("not found detail is handled", async () => {
    repository.findById.mockResolvedValue(null);

    const response = await request(app).get(`/api/v1/errands/${errandId}`);

    expect(response.statusCode).toBe(404);
  });
});

describe("Errands update and cancel", () => {
  test("owner can update an OPEN errand and derived fields are recalculated", async () => {
    const response = await request(app)
      .patch(`/api/v1/errands/${errandId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Buy urgent medicine",
        weightClass: "MEDIUM",
        isUrgent: true,
      });

    expect(response.statusCode).toBe(200);
    expect(repository.updateErrand).toHaveBeenCalledWith(
      errandId,
      expect.objectContaining({
        title: "Buy urgent medicine",
        calculatedFeeNis: 10,
        priorityScore: 18,
      }),
    );
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("non-owner update is rejected", async () => {
    repository.findById.mockResolvedValue(makeErrand({ requesterId: otherUserId }));

    await expect(
      service.updateErrand(userId, errandId, { title: "Updated" }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("immutable update fields are rejected by validation", async () => {
    const response = await request(app)
      .patch(`/api/v1/errands/${errandId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        requesterId: otherUserId,
      });

    expect(response.statusCode).toBe(400);
    expect(repository.updateErrand).not.toHaveBeenCalled();
  });

  test("non-editable errand update is rejected", async () => {
    repository.findById.mockResolvedValue(makeErrand({ status: "CANCELLED" }));

    await expect(
      service.updateErrand(userId, errandId, { title: "Updated" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Errand cannot be updated in its current status.",
    });
  });

  test("owner can cancel an OPEN errand", async () => {
    const response = await request(app)
      .post(`/api/v1/errands/${errandId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(repository.updateErrand).toHaveBeenCalledWith(errandId, {
      status: "CANCELLED",
    });
  });

  test("non-owner cancel is rejected", async () => {
    repository.findById.mockResolvedValue(makeErrand({ requesterId: otherUserId }));

    await expect(service.cancelErrand(userId, errandId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("terminal status cannot be cancelled", async () => {
    repository.findById.mockResolvedValue(makeErrand({ status: "COMPLETED" }));

    await expect(service.cancelErrand(userId, errandId)).rejects.toMatchObject({
      statusCode: 400,
      message: "Errand cannot be cancelled in its current status.",
    });
  });
});
