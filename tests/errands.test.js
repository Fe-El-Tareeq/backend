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
const secondCategoryId = "60a32850-bd3f-444a-84b4-c750abf6ecb5";
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
  destinationKeyword: "Central Pharmacy",
  pickupNeighborhoodId,
  items: [
    {
      categoryId,
      name: "Panadol",
      description: "One box of Panadol",
      quantity: 1,
      size: "SMALL",
      isUrgent: false,
      itemNote: null,
    },
  ],
  isInterZone: false,
  neededByTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  voiceNoteUrl: null,
  voiceNoteDurationSec: null,
  imageUrls: [
    "https://storage.example.com/errands/photo-1.jpg",
    "https://storage.example.com/errands/photo-2.jpg",
  ],
};

const makeErrand = (overrides = {}) => ({
  id: errandId,
  requesterId: userId,
  categoryId,
  neighborhoodId,
  destinationNeighborhoodId: pickupNeighborhoodId,
  clientRequestKey,
  title: "Panadol",
  itemsDescription: "1x Panadol - One box of Panadol",
  destinationKeyword: createPayload.destinationKeyword,
  weightClass: "LIGHT",
  isUrgent: false,
  isInterZone: createPayload.isInterZone,
  priorityScore: 8,
  calculatedFeeNis: 5,
  postTokenCost: 1,
  postTokenTransactionId: transactionId,
  voiceNoteUrl: null,
  voiceNoteDurationSec: null,
  status: "OPEN",
  cancellationReason: null,
  neededByTime: new Date(createPayload.neededByTime),
  expiresAt: new Date(createPayload.neededByTime),
  createdAt: new Date(),
  updatedAt: new Date(),
  category,
  items: [
    {
      id: "60a32850-bd3f-444a-84b4-c750abf6eca1",
      ...createPayload.items[0],
      category,
    },
  ],
  images: createPayload.imageUrls.map((imageUrl, position) => ({
    id: `60a32850-bd3f-444a-84b4-c750abf6ed1${position}`,
    imageUrl,
    position,
  })),
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
  repository.hasAssignmentHistory.mockResolvedValue(false);

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
  repository.findActiveCategoriesByIds.mockResolvedValue([category]);
  repository.findActiveNeighborhoodById.mockImplementation(async (id) => ({
    id,
    key: id === neighborhoodId ? "ASH_SHUJAIYEH" : "KHAN_YUNIS_CITY",
    name: "Catalog neighborhood",
    governorate: "Non-canonical display text",
  }));
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
    expect(response.body.data.errand.postTokenTransactionId).toBe(
      transactionId,
    );
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
        items: {
          create: [
            expect.objectContaining({
              name: "Panadol",
              quantity: 1,
              size: "SMALL",
              category: { connect: { id: categoryId } },
            }),
          ],
        },
        images: {
          create: [
            {
              imageUrl: "https://storage.example.com/errands/photo-1.jpg",
              position: 0,
            },
            {
              imageUrl: "https://storage.example.com/errands/photo-2.jpg",
              position: 1,
            },
          ],
        },
      }),
      tx,
    );
  });

  test("unauthenticated create is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .send(createPayload);

    expect(response.statusCode).toBe(401);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("creates multiple items atomically and charges only one token", async () => {
    repository.findActiveCategoriesByIds.mockResolvedValue([
      category,
      {
        id: secondCategoryId,
        name: "Documents",
        priorityWeight: 3,
        icon: "documents",
      },
    ]);

    const result = await service.createErrand(userId, {
      ...createPayload,
      items: [
        createPayload.items[0],
        {
          categoryId: secondCategoryId,
          name: "Passport copy",
          quantity: 2,
          size: "ENVELOPE",
          isUrgent: false,
          itemNote: "Keep dry",
        },
      ],
    });

    expect(result).toBeDefined();
    expect(walletService.debit).toHaveBeenCalledTimes(1);
    expect(repository.createErrand).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          create: expect.arrayContaining([
            expect.objectContaining({ name: "Panadol", quantity: 1 }),
            expect.objectContaining({ name: "Passport copy", quantity: 2 }),
          ]),
        },
      }),
      tx,
    );
  });

  test("insufficient wallet balance is rejected and no errand is created", async () => {
    walletService.debit.mockRejectedValue({
      statusCode: 400,
      message: "Insufficient token balance",
      errors: [],
    });

    await expect(
      service.createErrand(userId, createPayload),
    ).rejects.toMatchObject({
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

    await expect(
      service.createErrand(userId, createPayload),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Client request key has already been used with different errand data.",
    });
  });

  test("invalid or inactive category is rejected", async () => {
    repository.findActiveCategoriesByIds.mockResolvedValue([]);

    await expect(
      service.createErrand(userId, createPayload),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "One or more selected categories do not exist or are inactive.",
    });

    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("user without required neighborhood is rejected", async () => {
    repository.findRequesterForPosting.mockResolvedValue({
      ...requester,
      neighborhoodId: null,
      profileCompleted: false,
    });

    await expect(
      service.createErrand(userId, createPayload),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Complete your profile and select a neighborhood before posting errands.",
    });
  });

  test("invalid item size is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        items: [{ ...createPayload.items[0], size: "TINY" }],
      });

    expect(response.statusCode).toBe(400);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("item quantity below one is rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        items: [{ ...createPayload.items[0], quantity: 0 }],
      });

    expect(response.statusCode).toBe(400);
    expect(walletService.debit).not.toHaveBeenCalled();
  });

  test("more than five request images are rejected", async () => {
    const response = await request(app)
      .post("/api/v1/errands")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...createPayload,
        imageUrls: Array.from(
          { length: 6 },
          (_, index) => `https://storage.example.com/errands/${index}.jpg`,
        ),
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
      items: [
        {
          ...createPayload.items[0],
          size: "LARGE",
          isUrgent: true,
        },
      ],
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
          items: { some: { categoryId } },
          isUrgent: true,
          status: "OPEN",
        }),
        skip: 1,
        take: 5,
      }),
    );
  });

  test("list supports canonical zone and neighborhood filters", async () => {
    const response = await request(app).get(
      `/api/v1/errands?originZoneKey=GAZA_CITY&destinationZoneKey=KHAN_YUNIS&originNeighborhoodId=${neighborhoodId}&destinationNeighborhoodId=${pickupNeighborhoodId}`,
    );

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          neighborhoodId,
          neighborhood: { key: { in: expect.arrayContaining(["ASH_SHUJAIYEH"]) } },
          destinationNeighborhoodId: pickupNeighborhoodId,
          destinationNeighborhood: { key: { in: expect.arrayContaining(["KHAN_YUNIS_CITY"]) } },
        }),
      }),
    );
  });

  test("supports city aliases and rejects conflicts or neighborhood mismatches", async () => {
    const aliasResponse = await request(app).get(
      "/api/v1/errands?originCity=GAZA_CITY&destinationCity=KHAN_YUNIS",
    );
    const conflictResponse = await request(app).get(
      "/api/v1/errands?originZoneKey=GAZA_CITY&originCity=RAFAH",
    );
    const mismatchResponse = await request(app).get(
      `/api/v1/errands?originZoneKey=RAFAH&originNeighborhoodId=${neighborhoodId}`,
    );

    expect(aliasResponse.statusCode).toBe(200);
    expect(conflictResponse.statusCode).toBe(400);
    expect(mismatchResponse.statusCode).toBe(400);
  });

  test("destinationZoneKey constrains the destination relationship", async () => {
    const response = await request(app).get(
      "/api/v1/errands?destinationZoneKey=KHAN_YUNIS",
    );

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destinationNeighborhood: {
            key: { in: expect.arrayContaining(["KHAN_YUNIS_CITY"]) },
          },
        }),
      }),
    );
  });

  test("destinationCity remains a filtering alias", async () => {
    const response = await request(app).get(
      "/api/v1/errands?destinationCity=RAFAH",
    );

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destinationNeighborhood: {
            key: { in: expect.arrayContaining(["RAFAH_CITY"]) },
          },
        }),
      }),
    );
  });

  test("accepts a compatible destination zone and neighborhood", async () => {
    const response = await request(app).get(
      `/api/v1/errands?destinationZoneKey=KHAN_YUNIS&destinationNeighborhoodId=${pickupNeighborhoodId}`,
    );

    expect(response.statusCode).toBe(200);
  });

  test("rejects a destination zone and neighborhood mismatch", async () => {
    const response = await request(app).get(
      `/api/v1/errands?destinationZoneKey=RAFAH&destinationNeighborhoodId=${pickupNeighborhoodId}`,
    );

    expect(response.statusCode).toBe(400);
    expect(repository.listErrands).not.toHaveBeenCalled();
  });

  test("accepts equal origin and destination aliases", async () => {
    const response = await request(app).get(
      "/api/v1/errands?originZoneKey=GAZA_CITY&originCity=GAZA_CITY&destinationZoneKey=KHAN_YUNIS&destinationCity=KHAN_YUNIS",
    );

    expect(response.statusCode).toBe(200);
  });

  test("rejects conflicting destination aliases", async () => {
    const response = await request(app).get(
      "/api/v1/errands?destinationZoneKey=GAZA_CITY&destinationCity=KHAN_YUNIS",
    );

    expect(response.statusCode).toBe(400);
    expect(repository.listErrands).not.toHaveBeenCalled();
  });

  test("mine filter lists only the authenticated requester's errands", async () => {
    const response = await request(app)
      .get("/api/v1/errands?mine=true&status=MATCHED")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(repository.listErrands).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requesterId: userId,
          status: "MATCHED",
        }),
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
    repository.findById.mockResolvedValue(
      makeErrand({ requesterId: otherUserId }),
    );

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

  test("an OPEN errand cannot be updated after any proposal was accepted", async () => {
    repository.hasAssignmentHistory.mockResolvedValue(true);

    await expect(
      service.updateErrand(userId, errandId, { title: "Updated" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Errand cannot be updated after a proposal has been accepted.",
    });

    expect(repository.updateErrand).not.toHaveBeenCalled();
  });

  test("owner can cancel an OPEN errand", async () => {
    const response = await request(app)
      .post(`/api/v1/errands/${errandId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ cancellationReason: "I no longer need these items." });

    expect(response.statusCode).toBe(200);
    expect(repository.updateErrand).toHaveBeenCalledWith(errandId, {
      status: "CANCELLED",
      cancellationReason: "I no longer need these items.",
    });
  });

  test("non-owner cancel is rejected", async () => {
    repository.findById.mockResolvedValue(
      makeErrand({ requesterId: otherUserId }),
    );

    await expect(
      service.cancelErrand(userId, errandId, "Changed my mind."),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("terminal status cannot be cancelled", async () => {
    repository.findById.mockResolvedValue(makeErrand({ status: "COMPLETED" }));

    await expect(
      service.cancelErrand(userId, errandId, "Changed my mind."),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Errand cannot be cancelled in its current status.",
    });
  });

  test("cancellation reason is required", async () => {
    const response = await request(app)
      .post(`/api/v1/errands/${errandId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(response.statusCode).toBe(400);
    expect(repository.updateErrand).not.toHaveBeenCalled();
  });
});
