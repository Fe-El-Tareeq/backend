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

const generateOtpForPhone = (phone) => {
  if (
    env.otpFixedCode &&
    env.otpTestPhones.includes(phone)
  ) {
    return env.otpFixedCode;
  }

  return generateOtp();
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
  const otp = generateOtpForPhone(phone);
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await authRepository.createOtpVerification({
    phone,
    otpHash,
    channel,
    purpose: "PHONE_VERIFICATION",
    expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });

  await deliverOtp({ phone, channel, otp });

  return {
    message: "OTP sent successfully",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const ensureSignupBonus = async (wallet, userId, client) => {
  const idempotencyKey = `signup-bonus:${userId}`;
  const existingBonus = await walletRepository.findByIdempotencyKey(
    wallet.id,
    idempotencyKey,
    client,
  );

  if (existingBonus) {
    return;
  }

  await walletRepository.createLedgerEntry(
    {
      walletId: wallet.id,
      transactionType: "SIGNUP_BONUS",
      tokenAmount: SIGNUP_BONUS_TOKENS,
      balanceBefore: 0,
      balanceAfter: Number(wallet.tokenBalance || SIGNUP_BONUS_TOKENS),
      referenceType: "USER",
      referenceId: userId,
      idempotencyKey,
      description: "Initial signup bonus",
    },
    client,
  );
};

// Creates a wallet and records the initial signup bonus in the token ledger.
const createWalletWithSignupBonus = async (userId, client) => {
  const wallet = await authRepository.createWallet(userId, client);
  await ensureSignupBonus(wallet, userId, client);
  return wallet;
};

const ensureWallet = async (user, client) => {
  if (user.wallet) {
    await ensureSignupBonus(user.wallet, user.id, client);
    return user;
  }

  const wallet = await createWalletWithSignupBonus(user.id, client);

  return {
    ...user,
    wallet,
  };
};

const createOtpVerification = async (
  phone,
  channel = "SMS",
  client,
  purpose = "PHONE_VERIFICATION",
) => {
  const otp = generateOtpForPhone(phone);
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await authRepository.createOtpVerification(
    {
      phone,
      otpHash,
      channel,
      purpose,
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
    },
    client,
  );

  await deliverOtp({ phone, channel, otp });
};

const register = async ({
  fullName,
  phone,
  password,
  neighborhoodId,
}) => {
  const neighborhood = await authRepository.findActiveNeighborhoodById(
    neighborhoodId,
  );

  if (!neighborhood) {
    throw new ApiError(
      400,
      "Selected neighborhood does not exist or is inactive.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const trimmedFullName = fullName.trim();

  return authRepository.runTransaction(async (tx) => {
    const existingUser = await authRepository.findUserWithPasswordByPhone(
      phone,
      tx,
    );

    if (existingUser?.passwordHash && existingUser.phoneVerifiedAt) {
      throw new ApiError(409, "A user with this phone already exists.");
    }

    if (existingUser) {
      await authRepository.updatePreparedUserRegistration(
        existingUser.id,
        {
          fullName: trimmedFullName,
          passwordHash,
          neighborhoodId: neighborhood.id,
        },
        tx,
      );
    } else {
      await authRepository.createUserWithPassword(
        {
          fullName: trimmedFullName,
          phone,
          passwordHash,
          neighborhoodId: neighborhood.id,
        },
        tx,
      );
    }

    await createOtpVerification(phone, "SMS", tx, "PHONE_VERIFICATION");

    return {
      message: "Registration OTP sent successfully",
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    };
  });
};

const login = async (phone, password) => {
  const user = await authRepository.findUserWithPasswordByPhone(phone);

  if (!user?.passwordHash) {
    throw new ApiError(401, "Invalid phone or password.");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new ApiError(401, "Invalid phone or password.");
  }

  if (!user.phoneVerifiedAt) {
    throw new ApiError(403, "Phone number is not verified.");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "User is not active.");
  }

  const auth = await buildAuthResponse(user);

  return {
    message: "Logged in successfully",
    ...auth,
  };
};

const getOrCreateVerifiedUser = async (phone, client) => {
  const existingUser = await authRepository.findUserByPhone(phone, client);

  if (!existingUser) {
    throw new ApiError(404, "User not found.");
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

const validateOtpRecord = (otpRecord, now, invalidMessage = "Invalid OTP.") => {
  if (!otpRecord) {
    throw new ApiError(404, invalidMessage);
  }

  if (otpRecord.verifiedAt) {
    throw new ApiError(400, "OTP has already been used.");
  }

  if (otpRecord.expiresAt <= now) {
    throw new ApiError(400, "OTP has expired.");
  }

  if (otpRecord.attemptCount >= otpRecord.maxAttempts) {
    throw new ApiError(429, "Too many OTP attempts.");
  }
};

const verifyOtp = async (phone, otp) => {
  const now = new Date();
  const otpRecord = await authRepository.findLatestOtpByPhone(
    phone,
    "PHONE_VERIFICATION",
  );

  validateOtpRecord(otpRecord, now, "OTP not found.");
  const isValidOtp = await bcrypt.compare(otp, otpRecord.otpHash);

  if (!isValidOtp) {
    await authRepository.incrementOtpAttempts(
      otpRecord.id,
      otpRecord.maxAttempts,
    );
    throw new ApiError(401, "Invalid OTP.");
  }

  return authRepository.runTransaction(async (tx) => {
    const claim = await authRepository.claimOtpVerification(
      otpRecord.id,
      now,
      otpRecord.maxAttempts,
      tx,
    );

    if (claim.count !== 1) {
      throw new ApiError(409, "OTP is no longer available.");
    }

    const user = await getOrCreateVerifiedUser(phone, tx);
    const auth = await buildAuthResponse(user, tx);

    return {
      message: "OTP verified successfully",
      ...auth,
    };
  });
};

const forgotPassword = async (phone, channel = "SMS") => {
  const user = await authRepository.findUserByPhone(phone);

  if (user) {
    await createOtpVerification(
      phone,
      channel,
      undefined,
      "PASSWORD_RESET",
    );
  }

  return {
    message: "If an account exists, a reset code has been sent.",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const resetPassword = async (phone, otp, newPassword) => {
  const now = new Date();
  const [user, otpRecord] = await Promise.all([
    authRepository.findUserByPhone(phone),
    authRepository.findLatestOtpByPhone(phone, "PASSWORD_RESET"),
  ]);

  if (!user || !otpRecord) {
    throw new ApiError(400, "Invalid or expired password reset code.");
  }

  validateOtpRecord(otpRecord, now, "Invalid or expired password reset code.");
  const isValidOtp = await bcrypt.compare(otp, otpRecord.otpHash);

  if (!isValidOtp) {
    await authRepository.incrementOtpAttempts(
      otpRecord.id,
      otpRecord.maxAttempts,
    );
    throw new ApiError(401, "Invalid password reset code.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  return authRepository.runTransaction(async (tx) => {
    const claim = await authRepository.claimOtpVerification(
      otpRecord.id,
      now,
      otpRecord.maxAttempts,
      tx,
    );

    if (claim.count !== 1) {
      throw new ApiError(409, "Password reset code is no longer available.");
    }

    await authRepository.updateUserPassword(user.id, passwordHash, tx);
    await authRepository.revokeAllRefreshTokensForUser(user.id, tx);

    return {
      message: "Password reset successfully. Please log in again.",
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
  register,
  login,
  requestOtp,
  verifyOtp,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  hashRefreshToken,
};
