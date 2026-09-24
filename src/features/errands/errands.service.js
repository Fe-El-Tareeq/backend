const ApiError = require("../../utils/ApiError");
const walletService = require("../wallet/wallet.service");
const repository = require("./errands.repository");
const {
  ERRAND_POST_TOKEN_COST,
  calculateFeeNis,
  calculatePriorityScore,
  calculateExpiresAt,
} = require("./errands.rules");
const { findCityByKey } = require("../locations/locations.catalog");

const EDITABLE_STATUSES = ["OPEN"];
const CANCELLABLE_STATUSES = ["OPEN"];

const SIZE_TO_WEIGHT_CLASS = {
  ENVELOPE: "LIGHT",
  SMALL: "LIGHT",
  MEDIUM: "MEDIUM",
  LARGE: "HEAVY",
};

const WEIGHT_CLASS_RANK = {
  LIGHT: 1,
  MEDIUM: 2,
  HEAVY: 3,
};

const normalizeItem = (item) => ({
  categoryId: item.categoryId,
  name: item.name.trim(),
  description: item.description?.trim() || null,
  quantity: item.quantity,
  size: item.size,
  isUrgent: item.isUrgent || false,
  itemNote: item.itemNote?.trim() || null,
});

const deriveLegacyItemFields = (items) => {
  const weightClass = items.reduce((largest, item) => {
    const current = SIZE_TO_WEIGHT_CLASS[item.size];
    return WEIGHT_CLASS_RANK[current] > WEIGHT_CLASS_RANK[largest]
      ? current
      : largest;
  }, "LIGHT");

  return {
    categoryId: items[0].categoryId,
    title: items[0].name,
    itemsDescription: items
      .map(
        (item) =>
          `${item.quantity}x ${item.name}${item.description ? ` - ${item.description}` : ""}`,
      )
      .join("; "),
    weightClass,
    isUrgent: items.some((item) => item.isUrgent),
  };
};

const normalizePayload = (payload) => {
  const items = payload.items?.map(normalizeItem);
  const derivedItemFields = items?.length ? deriveLegacyItemFields(items) : {};

  return {
    ...payload,
    ...derivedItemFields,
    items,
    title: payload.title?.trim() || derivedItemFields.title,
    itemsDescription:
      payload.itemsDescription?.trim() || derivedItemFields.itemsDescription,
    imageUrls: payload.imageUrls?.map((imageUrl) => imageUrl.trim()) || [],
    destinationKeyword: payload.destinationKeyword?.trim(),
    isUrgent: derivedItemFields.isUrgent ?? payload.isUrgent ?? false,
    isInterZone: payload.isInterZone || false,
    neededByTime: payload.neededByTime ? new Date(payload.neededByTime) : null,
    voiceNoteUrl:
      payload.voiceNoteUrl === undefined ? null : payload.voiceNoteUrl,
    voiceNoteDurationSec:
      payload.voiceNoteDurationSec === undefined
        ? null
        : payload.voiceNoteDurationSec,
  };
};

const toComparablePayload = (payload) => {
  const normalized = normalizePayload(payload);

  return {
    categoryId: normalized.categoryId,
    pickupNeighborhoodId: normalized.pickupNeighborhoodId,
    title: normalized.title,
    itemsDescription: normalized.itemsDescription,
    destinationKeyword: normalized.destinationKeyword,
    weightClass: normalized.weightClass,
    isUrgent: normalized.isUrgent,
    isInterZone: normalized.isInterZone,
    neededByTime: normalized.neededByTime
      ? normalized.neededByTime.toISOString()
      : null,
    voiceNoteUrl: normalized.voiceNoteUrl || null,
    voiceNoteDurationSec: normalized.voiceNoteDurationSec,
    items: normalized.items,
    imageUrls: normalized.imageUrls,
  };
};

const existingToComparablePayload = (errand) => {
  return {
    categoryId: errand.categoryId,
    pickupNeighborhoodId: errand.destinationNeighborhoodId,
    title: errand.title,
    itemsDescription: errand.itemsDescription,
    destinationKeyword: errand.destinationKeyword,
    weightClass: errand.weightClass,
    isUrgent: errand.isUrgent,
    isInterZone: errand.isInterZone,
    neededByTime: errand.neededByTime
      ? errand.neededByTime.toISOString()
      : null,
    voiceNoteUrl: errand.voiceNoteUrl || null,
    voiceNoteDurationSec: errand.voiceNoteDurationSec,
    items: errand.items?.map(({ category, id, ...item }) => item),
    imageUrls: errand.images?.map((image) => image.imageUrl) || [],
  };
};

const assertSameIdempotentRequest = (existingErrand, payload) => {
  const existingComparable = existingToComparablePayload(existingErrand);
  const incomingComparable = toComparablePayload(payload);

  if (
    JSON.stringify(existingComparable) !== JSON.stringify(incomingComparable)
  ) {
    throw new ApiError(
      409,
      "Client request key has already been used with different errand data.",
    );
  }
};

const assertRequesterCanPost = (requester) => {
  if (!requester) {
    throw new ApiError(404, "Requester not found.");
  }

  if (!requester.phoneVerifiedAt) {
    throw new ApiError(403, "Phone number is not verified.");
  }

  if (!requester.profileCompleted || !requester.neighborhoodId) {
    throw new ApiError(
      400,
      "Complete your profile and select a neighborhood before posting errands.",
    );
  }
};

const assertEditable = (errand) => {
  if (!EDITABLE_STATUSES.includes(errand.status)) {
    throw new ApiError(400, "Errand cannot be updated in its current status.");
  }
};

const assertCancellable = (errand) => {
  if (!CANCELLABLE_STATUSES.includes(errand.status)) {
    throw new ApiError(
      400,
      "Errand cannot be cancelled in its current status.",
    );
  }
};

const assertOwner = (errand, userId) => {
  if (errand.requesterId !== userId) {
    throw new ApiError(403, "You are not allowed to modify this errand.");
  }
};

const buildDerivedFields = (payload, category) => {
  const expiresAt = calculateExpiresAt(payload.neededByTime);

  return {
    calculatedFeeNis: calculateFeeNis(payload),
    priorityScore: calculatePriorityScore({
      category,
      isUrgent: payload.isUrgent,
      neededByTime: payload.neededByTime,
    }),
    expiresAt,
  };
};

const createErrand = async (requesterId, payload) => {
  const normalized = normalizePayload(payload);

  return repository.runTransaction(async (tx) => {
    const existingErrand = await repository.findByRequesterAndClientKey(
      requesterId,
      normalized.clientRequestKey,
      tx,
    );

    if (existingErrand) {
      assertSameIdempotentRequest(existingErrand, normalized);
      return existingErrand;
    }

    const requester = await repository.findRequesterForPosting(requesterId, tx);
    assertRequesterCanPost(requester);

    const categoryIds = [
      ...new Set(normalized.items.map((item) => item.categoryId)),
    ];
    const categories = await repository.findActiveCategoriesByIds(
      categoryIds,
      tx,
    );

    if (categories.length !== categoryIds.length) {
      throw new ApiError(
        400,
        "One or more selected categories do not exist or are inactive.",
      );
    }

    const pickupNeighborhood = await repository.findActiveNeighborhoodById(
      normalized.pickupNeighborhoodId,
      tx,
    );

    if (!pickupNeighborhood) {
      throw new ApiError(
        400,
        "Selected pickup neighborhood does not exist or is inactive.",
      );
    }

    const priorityCategory = categories.reduce((highest, category) =>
      Number(category.priorityWeight) > Number(highest.priorityWeight)
        ? category
        : highest,
    );
    const derivedFields = buildDerivedFields(normalized, priorityCategory);
    const debit = await walletService.debit({
      userId: requesterId,
      amount: ERRAND_POST_TOKEN_COST,
      transactionType: "ERRAND_POST_DEBIT",
      referenceType: "ERRAND",
      referenceId: null,
      idempotencyKey: `errand-post:${requesterId}:${normalized.clientRequestKey}`,
      description: "Errand posting token debit",
      client: tx,
    });

    return repository.createErrand(
      {
        requesterId,
        categoryId: normalized.categoryId,
        neighborhoodId: requester.neighborhoodId,
        destinationNeighborhoodId: pickupNeighborhood.id,
        clientRequestKey: normalized.clientRequestKey,
        title: normalized.title,
        itemsDescription: normalized.itemsDescription,
        destinationKeyword: normalized.destinationKeyword,
        weightClass: normalized.weightClass,
        isUrgent: normalized.isUrgent,
        isInterZone: normalized.isInterZone,
        calculatedFeeNis: derivedFields.calculatedFeeNis,
        priorityScore: derivedFields.priorityScore,
        postTokenCost: ERRAND_POST_TOKEN_COST,
        postTokenTransactionId: debit.id,
        voiceNoteUrl: normalized.voiceNoteUrl,
        voiceNoteDurationSec: normalized.voiceNoteDurationSec,
        neededByTime: normalized.neededByTime,
        expiresAt: derivedFields.expiresAt,
        items: {
          create: normalized.items.map(({ categoryId, ...item }) => ({
            ...item,
            category: { connect: { id: categoryId } },
          })),
        },
        images: {
          create: normalized.imageUrls.map((imageUrl, position) => ({
            imageUrl,
            position,
          })),
        },
      },
      tx,
    );
  });
};

const buildListWhere = async (user, filters) => {
  const where = {};

  if (filters.mine) {
    if (!user)
      throw new ApiError(
        401,
        "Authentication is required to list your errands.",
      );
    where.requesterId = user.id;
  }

  const originNeighborhoodId =
    filters.originNeighborhoodId || filters.neighborhoodId;

  if (originNeighborhoodId) {
    where.neighborhoodId = originNeighborhoodId;
  }

  if (filters.originCity) {
    where.neighborhood = {
      governorate: findCityByKey(filters.originCity).nameAr,
    };
  }

  if (!originNeighborhoodId && !filters.originCity && user && !filters.mine) {
    const requester = await repository.findRequesterForPosting(user.id);
    if (requester?.neighborhoodId) {
      where.neighborhoodId = requester.neighborhoodId;
    }
  }

  if (filters.destinationNeighborhoodId) {
    where.destinationNeighborhoodId = filters.destinationNeighborhoodId;
  }

  if (filters.destinationCity) {
    where.destinationNeighborhood = {
      governorate: findCityByKey(filters.destinationCity).nameAr,
    };
  }

  if (filters.status) {
    where.status = filters.status;
  } else if (!filters.mine) {
    where.status = "OPEN";
    where.expiresAt = {
      gt: new Date(),
    };
  }

  if (filters.categoryId) {
    where.items = {
      some: { categoryId: filters.categoryId },
    };
  }

  if (filters.urgent !== undefined) {
    where.isUrgent = filters.urgent;
  }

  return where;
};

const listErrands = async (user, filters) => {
  const where = await buildListWhere(user, filters);
  const { skip, take } = filters;

  const [errands, total, summary] = await Promise.all([
    repository.listErrands({ where, skip, take }),
    repository.countErrands(where),
    filters.mine ? repository.summarizeUserErrands(user.id) : null,
  ]);

  return {
    errands,
    pagination: {
      skip,
      take,
      total,
    },
    ...(summary ? { summary } : {}),
  };
};

const getErrandById = async (id) => {
  const errand = await repository.findById(id);

  if (!errand) {
    throw new ApiError(404, "Errand not found.");
  }

  return errand;
};

const updateErrand = async (userId, id, payload) => {
  const existingErrand = await repository.findById(id);

  if (!existingErrand) {
    throw new ApiError(404, "Errand not found.");
  }

  assertOwner(existingErrand, userId);
  assertEditable(existingErrand);

  if (await repository.hasAssignmentHistory(id)) {
    throw new ApiError(
      409,
      "Errand cannot be updated after a proposal has been accepted.",
    );
  }

  const merged = normalizePayload({
    categoryId: existingErrand.categoryId,
    pickupNeighborhoodId: existingErrand.destinationNeighborhoodId,
    title: existingErrand.title,
    itemsDescription: existingErrand.itemsDescription,
    destinationKeyword: existingErrand.destinationKeyword,
    weightClass: existingErrand.weightClass,
    isUrgent: existingErrand.isUrgent,
    isInterZone: existingErrand.isInterZone,
    neededByTime: existingErrand.neededByTime
      ? existingErrand.neededByTime.toISOString()
      : null,
    voiceNoteUrl: existingErrand.voiceNoteUrl,
    voiceNoteDurationSec: existingErrand.voiceNoteDurationSec,
    ...payload,
  });

  const category = await repository.findActiveCategoryById(merged.categoryId);

  if (!category) {
    throw new ApiError(400, "Selected category does not exist or is inactive.");
  }
  const pickupNeighborhood = await repository.findActiveNeighborhoodById(
    merged.pickupNeighborhoodId,
  );

  if (!pickupNeighborhood) {
    throw new ApiError(
      400,
      "Selected pickup neighborhood does not exist or is inactive.",
    );
  }

  const derivedFields = buildDerivedFields(merged, category);

  return repository.updateErrand(id, {
    categoryId: merged.categoryId,
    destinationNeighborhoodId: pickupNeighborhood.id,
    title: merged.title,
    itemsDescription: merged.itemsDescription,
    destinationKeyword: merged.destinationKeyword,
    weightClass: merged.weightClass,
    isUrgent: merged.isUrgent,
    isInterZone: merged.isInterZone,
    calculatedFeeNis: derivedFields.calculatedFeeNis,
    priorityScore: derivedFields.priorityScore,
    voiceNoteUrl: merged.voiceNoteUrl,
    voiceNoteDurationSec: merged.voiceNoteDurationSec,
    neededByTime: merged.neededByTime,
    expiresAt: derivedFields.expiresAt,
  });
};

const cancelErrand = async (userId, id, cancellationReason) => {
  const existingErrand = await repository.findById(id);

  if (!existingErrand) {
    throw new ApiError(404, "Errand not found.");
  }

  assertOwner(existingErrand, userId);
  assertCancellable(existingErrand);

  return repository.updateErrand(id, {
    status: "CANCELLED",
    cancellationReason: cancellationReason.trim(),
  });
};

module.exports = {
  createErrand,
  listErrands,
  getErrandById,
  updateErrand,
  cancelErrand,
};
