const prisma = require("../../config/prisma");

const runTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

const findLatestOtpByPhone = async (
  phone,
  purpose = "PHONE_VERIFICATION",
  client = prisma,
) => {
  return client.otpVerification.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: "desc" },
  });
};

const createOtpVerification = async (
  {
    phone,
    otpHash,
    channel,
    purpose = "PHONE_VERIFICATION",
    expiresAt,
    maxAttempts,
  },
  client = prisma
) => {
  return client.otpVerification.create({
    data: {
      phone,
      otpHash,
      channel,
      purpose,
      expiresAt,
      maxAttempts,
    },
  });
};

const incrementOtpAttempts = async (id, maxAttempts, client = prisma) => {
  return client.otpVerification.updateMany({
    where: {
      id,
      attemptCount: {
        lt: maxAttempts,
      },
    },
    data: {
      attemptCount: {
        increment: 1,
      },
    },
  });
};

const claimOtpVerification = async (
  id,
  now,
  maxAttempts,
  client = prisma,
) => {
  return client.otpVerification.updateMany({
    where: {
      id,
      verifiedAt: null,
      expiresAt: { gt: now },
      attemptCount: { lt: maxAttempts },
    },
    data: {
      verifiedAt: now,
    },
  });
};

const findUserByPhone = async (phone, client = prisma) => {
  return client.user.findUnique({
    where: { phone },
    include: {
      wallet: true,
    },
  });
};

const findUserWithPasswordByPhone = async (phone, client = prisma) => {
  return client.user.findUnique({
    where: { phone },
    include: {
      wallet: true,
    },
  });
};

const findPendingRegistrationByPhone = (phone, client = prisma) =>
  client.pendingRegistration.findUnique({ where: { phone } });

const upsertPendingRegistration = (data, client = prisma) =>
  client.pendingRegistration.upsert({
    where: { phone: data.phone },
    create: data,
    update: {
      fullName: data.fullName,
      passwordHash: data.passwordHash,
      neighborhoodId: data.neighborhoodId,
      expiresAt: data.expiresAt,
    },
  });

const deletePendingRegistration = (phone, client = prisma) =>
  client.pendingRegistration.delete({ where: { phone } });

const createVerifiedUserFromPending = (pending, client = prisma) =>
  client.user.create({
    data: {
      fullName: pending.fullName,
      phone: pending.phone,
      passwordHash: pending.passwordHash,
      neighborhoodId: pending.neighborhoodId,
      profileCompleted: true,
      phoneVerifiedAt: new Date(),
    },
    include: { wallet: true },
  });

const findUserById = async (userId, client = prisma) => {
  return client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      role: true,
      status: true,
    },
  });
};

const findActiveNeighborhoodById = async (neighborhoodId, client = prisma) => {
  return client.neighborhood.findFirst({
    where: {
      id: neighborhoodId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      governorate: true,
    },
  });
};

const createUser = async (phone, client = prisma) => {
  return client.user.create({
    data: {
      phone,
      phoneVerifiedAt: new Date(),
    },
    include: {
      wallet: true,
    },
  });
};

const createUserWithPassword = async (
  {
    fullName,
    phone,
    passwordHash,
    neighborhoodId,
  },
  client = prisma,
) => {
  return client.user.create({
    data: {
      fullName,
      phone,
      passwordHash,
      neighborhoodId,
      profileCompleted: true,
    },
    include: {
      wallet: true,
    },
  });
};

const updatePreparedUserRegistration = async (
  userId,
  {
    fullName,
    passwordHash,
    neighborhoodId,
  },
  client = prisma,
) => {
  return client.user.update({
    where: { id: userId },
    data: {
      fullName,
      passwordHash,
      neighborhoodId,
      profileCompleted: true,
    },
    include: {
      wallet: true,
    },
  });
};

const createWallet = async (userId, client = prisma) => {
  return client.wallet.create({
    data: {
      userId,
    },
  });
};

const updateUserPhoneVerifiedAt = async (userId, client = prisma) => {
  return client.user.update({
    where: { id: userId },
    data: {
      phoneVerifiedAt: new Date(),
    },
    include: {
      wallet: true,
    },
  });
};

const createRefreshToken = async (
  {
    userId,
    tokenHash,
    expiresAt,
  },
  client = prisma
) => {
  return client.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });
};

const findRefreshTokenByHash = async (tokenHash, client = prisma) => {
  return client.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });
};

const revokeRefreshToken = async (id, client = prisma) => {
  return client.refreshToken.update({
    where: { id },
    data: {
      revokedAt: new Date(),
    },
  });
};

const updateUserPassword = async (userId, passwordHash, client = prisma) => {
  return client.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
};

const revokeAllRefreshTokensForUser = async (userId, client = prisma) => {
  return client.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

const reactivateUser = (userId, client = prisma) =>
  client.user.update({
    where: { id: userId },
    data: {
      status: "ACTIVE",
      deletionRequestedAt: null,
      deletionScheduledAt: null,
    },
    include: { wallet: true },
  });

module.exports = {
  runTransaction,
  findLatestOtpByPhone,
  createOtpVerification,
  incrementOtpAttempts,
  claimOtpVerification,
  findUserByPhone,
  findUserWithPasswordByPhone,
  findPendingRegistrationByPhone,
  upsertPendingRegistration,
  deletePendingRegistration,
  createVerifiedUserFromPending,
  findUserById,
  findActiveNeighborhoodById,
  createUser,
  createUserWithPassword,
  updatePreparedUserRegistration,
  createWallet,
  updateUserPhoneVerifiedAt,
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  updateUserPassword,
  revokeAllRefreshTokensForUser,
  reactivateUser,
};
