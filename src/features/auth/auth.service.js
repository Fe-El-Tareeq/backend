const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} = require("./auth.constants");

const ApiError = require("../../utils/ApiError");
const env = require("../../config/env");
const authRepository = require("./auth.repository");
const walletRepository = require("../wallet/wallet.repository");

// Signup bonus granted when a wallet is created.
const SIGNUP_BONUS_TOKENS = 3;

const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

const hashRefreshToken = (refreshToken) => {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
};

const parseExpiresIn = (expiresIn) => {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);

  if (!match) {
    throw new Error(`Unsupported token expiry format: ${expiresIn}`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
};

const createAccessToken = (user) => {
  return jwt.sign(
    {
      type: "access",
      userId: user.id,
      role: user.role,
    },
    env.jwtAccessSecret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    },
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    {
      type: "refresh",
      jti: crypto.randomUUID(),
      userId: user.id,
    },
    env.jwtRefreshSecret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    },
  );
};

const persistRefreshToken = async (user, client) => {
  const refreshToken = createRefreshToken(user);
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + parseExpiresIn(REFRESH_TOKEN_EXPIRES_IN),
  );

  await authRepository.createRefreshToken(
    {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
    client,
  );

  return refreshToken;
};

const buildAuthResponse = async (user, client) => {
  const accessToken = createAccessToken(user);
  const refreshToken = await persistRefreshToken(user, client);

  return {
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
    },
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
  };
};

const deliverOtp = async ({ phone, channel, otp }) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV OTP] ${channel} ${phone}: ${otp}`);
  }

  // TODO: Integrate a real SMS/WhatsApp OTP provider before production use.
};

const requestOtp = async (phone, channel = "SMS") => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await authRepository.createOtpVerification({
    phone,
    otpHash,
    channel,
    expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });

  await deliverOtp({ phone, channel, otp });

  return {
    message: "OTP sent successfully",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};
// Creates a wallet and records the initial signup bonus in the token ledger.
const createWalletWithSignupBonus = async (userId, client) => {
  const wallet = await authRepository.createWallet(userId, client);

  await walletRepository.createLedgerEntry(
    {
      walletId: wallet.id,
      transactionType: "SIGNUP_BONUS",
      tokenAmount: SIGNUP_BONUS_TOKENS,
      balanceBefore: 0,
      balanceAfter: SIGNUP_BONUS_TOKENS,
      referenceType: "USER",
      referenceId: userId,
      idempotencyKey: `signup-bonus:${userId}`,
      description: "Initial signup bonus",
    },
    client,
  );

  return wallet;
};

const getOrCreateVerifiedUser = async (phone, client) => {
  const existingUser = await authRepository.findUserByPhone(phone, client);

  if (!existingUser) {
    const user = await authRepository.createUser(phone, client);
    const wallet = await createWalletWithSignupBonus(user.id, client);
    return {
      ...user,
      wallet,
    };
  }

  let user = existingUser;

  if (!user.phoneVerifiedAt) {
    user = await authRepository.updateUserPhoneVerifiedAt(user.id, client);
  }

  if (!user.wallet) {
    const wallet = await createWalletWithSignupBonus(user.id, client);
    return {
      ...user,
      wallet,
    };
  }

  return user;
};

const verifyOtp = async (phone, otp) => {
  return authRepository.runTransaction(async (tx) => {
    const otpRecord = await authRepository.findLatestOtpByPhone(phone, tx);

    if (!otpRecord) {
      throw new ApiError(404, "OTP not found.");
    }

    if (otpRecord.verifiedAt) {
      throw new ApiError(400, "OTP has already been used.");
    }

    if (otpRecord.expiresAt <= new Date()) {
      throw new ApiError(400, "OTP has expired.");
    }

    if (otpRecord.attemptCount >= otpRecord.maxAttempts) {
      throw new ApiError(429, "Too many OTP attempts.");
    }

    const isValidOtp = await bcrypt.compare(otp, otpRecord.otpHash);

    if (!isValidOtp) {
      await authRepository.incrementOtpAttempts(otpRecord.id, tx);
      throw new ApiError(401, "Invalid OTP.");
    }

    await authRepository.markOtpAsVerified(otpRecord.id, tx);

    const user = await getOrCreateVerifiedUser(phone, tx);
    const auth = await buildAuthResponse(user, tx);

    return {
      message: "OTP verified successfully",
      ...auth,
    };
  });
};

const refresh = async (refreshToken) => {
  let payload;

  try {
    payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token.");
  }

  if (payload.type !== "refresh" || !payload.userId) {
    throw new ApiError(401, "Invalid refresh token.");
  }

  const tokenHash = hashRefreshToken(refreshToken);

  return authRepository.runTransaction(async (tx) => {
    const storedToken = await authRepository.findRefreshTokenByHash(
      tokenHash,
      tx,
    );

    if (!storedToken) {
      throw new ApiError(401, "Refresh token not found.");
    }

    if (storedToken.revokedAt) {
      throw new ApiError(401, "Refresh token has been revoked.");
    }

    if (storedToken.expiresAt <= new Date()) {
      throw new ApiError(401, "Refresh token has expired.");
    }

    if (!storedToken.user || storedToken.user.status !== "ACTIVE") {
      throw new ApiError(403, "User is not active.");
    }

    await authRepository.revokeRefreshToken(storedToken.id, tx);

    const accessToken = createAccessToken(storedToken.user);
    const newRefreshToken = await persistRefreshToken(storedToken.user, tx);

    return {
      message: "Token refreshed successfully",
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
    };
  });
};

const logout = async (refreshToken) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const storedToken = await authRepository.findRefreshTokenByHash(tokenHash);

  if (storedToken && !storedToken.revokedAt) {
    await authRepository.revokeRefreshToken(storedToken.id);
  }

  return {
    message: "Logged out successfully",
  };
};

module.exports = {
  requestOtp,
  verifyOtp,
  refresh,
  logout,
  hashRefreshToken,
};
