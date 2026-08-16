const prisma = require("../../config/prisma");

const runTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

const findLatestOtpByPhone = async (phone, client = prisma) => {
  return client.otpVerification.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
};

const createOtpVerification = async (
  {
    phone,
    otpHash,
    channel,
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
      expiresAt,
      maxAttempts,
    },
  });
};

const incrementOtpAttempts = async (id, client = prisma) => {
  return client.otpVerification.update({
    where: { id },
    data: {
      attemptCount: {
        increment: 1,
      },
    },
  });
};

const markOtpAsVerified = async (id, client = prisma) => {
  return client.otpVerification.update({
    where: { id },
    data: {
      verifiedAt: new Date(),
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

module.exports = {
  runTransaction,
  findLatestOtpByPhone,
  createOtpVerification,
  incrementOtpAttempts,
  markOtpAsVerified,
  findUserByPhone,
  findUserById,
  createUser,
  createWallet,
  updateUserPhoneVerifiedAt,
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
};
