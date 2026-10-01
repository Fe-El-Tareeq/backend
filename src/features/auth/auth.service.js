const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} = require("./auth.constants");

const ApiError = require("../../utils/ApiError");
const env = require("../../config/env");
const authRepository = require("./auth.repository");
const walletRepository = require("../wallet/wallet.repository");
const legalService = require("../legal/legal.service");
const verificationDelivery = require("./verificationDelivery.service");
const { isAccountVerifiedForAccess } = require("./accountVerification");

// Signup bonus granted when a wallet is created.
const SIGNUP_BONUS_TOKENS = 10;

const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const generateOtpForEmail = (email) => {
  if (
    env.nodeEnv !== "production" &&
    env.testOtpCode &&
    env.testOtpEmail === email
  ) {
    return env.testOtpCode;
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

const createAndDeliverOtp = async ({ phone, email, purpose }) => {
  const now = new Date();
  const latestDelivered = await authRepository.findLatestOtpByPhone(
    phone,
    purpose,
  );
  if (
    latestDelivered?.deliveredAt &&
    now.getTime() - latestDelivered.deliveredAt.getTime() <
      OTP_RESEND_COOLDOWN_SECONDS * 1000
  ) {
    throw new ApiError(
      429,
      `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
    );
  }

  const otp = generateOtpForEmail(email);
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const createdOtp = await authRepository.createOtpVerification({
    phone,
    email,
    otpHash,
    channel: "EMAIL",
    purpose,
    expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });

  try {
    await verificationDelivery.sendVerificationCode({
      email,
      code: otp,
      purpose,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
    await authRepository.runTransaction(async (tx) => {
      const deliveredAt = new Date();
      const marked = await authRepository.markOtpDelivered(
        createdOtp.id,
        deliveredAt,
        tx,
      );
      if (marked.count !== 1) {
        throw new Error("OTP delivery state is no longer available");
      }
      await authRepository.invalidateSupersededOtps(
        phone,
        purpose,
        createdOtp,
        deliveredAt,
        tx,
      );
    });
  } catch (error) {
    await authRepository
      .invalidateOtpVerification(createdOtp.id, new Date())
      .catch(() => undefined);
    throw new ApiError(
      503,
      "Unable to deliver the verification code. Please try again later.",
    );
  }

  return createdOtp;
};

const requestOtp = async (phone) => {
  const pending = await authRepository.findPendingRegistrationByPhone(phone);
  if (!pending?.email || pending.expiresAt <= new Date()) {
    throw new ApiError(404, "Pending registration not found or expired.");
  }
  await createAndDeliverOtp({
    phone,
    email: pending.email,
    purpose: "EMAIL_VERIFICATION",
  });

  return {
    message: "Verification code sent successfully",
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

const register = async ({
  fullName,
  phone,
  email,
  password,
  neighborhoodId,
  termsAccepted,
}) => {
  if (termsAccepted !== true) {
    throw new ApiError(400, "Terms and privacy policy must be accepted.");
  }

  const legalVersions = legalService.current();
  const neighborhood =
    await authRepository.findActiveNeighborhoodById(neighborhoodId);

  if (!neighborhood) {
    throw new ApiError(
      400,
      "Selected neighborhood does not exist or is inactive.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const trimmedFullName = fullName.trim();
  const normalizedEmail = normalizeEmail(email);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const [existingUserByPhone, existingUserByEmail, pendingByEmail] =
    await Promise.all([
      authRepository.findUserWithPasswordByPhone(phone),
      authRepository.findUserByEmail(normalizedEmail),
      authRepository.findPendingRegistrationByEmail(normalizedEmail),
    ]);

  if (existingUserByPhone) {
    throw new ApiError(409, "A user with this phone already exists.");
  }
  if (existingUserByEmail || (pendingByEmail && pendingByEmail.phone !== phone)) {
    throw new ApiError(409, "A user with this email already exists.");
  }

  try {
    await authRepository.upsertPendingRegistration({
      fullName: trimmedFullName,
      phone,
      email: normalizedEmail,
      passwordHash,
      neighborhoodId: neighborhood.id,
      termsVersion: legalVersions.termsVersion,
      privacyVersion: legalVersions.privacyVersion,
      expiresAt,
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new ApiError(409, "A user with this email already exists.");
    }
    throw error;
  }

  await createAndDeliverOtp({
    phone,
    email: normalizedEmail,
    purpose: "EMAIL_VERIFICATION",
  });

  return {
    message: "Registration verification code sent successfully",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const authenticatePassword = async (phone, password) => {
  const user = await authRepository.findUserWithPasswordByPhone(phone);

  if (!user?.passwordHash) {
    throw new ApiError(401, "Invalid phone or password.");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new ApiError(401, "Invalid phone or password.");
  }

  return user;
};

const login = async (phone, password) => {
  const user = await authenticatePassword(phone, password);

  if (!isAccountVerifiedForAccess(user)) {
    throw new ApiError(403, "Account email is not verified.");
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

const validateOtpRecord = (otpRecord, now, invalidMessage = "Invalid OTP.") => {
  if (!otpRecord) {
    throw new ApiError(404, invalidMessage);
  }

  if (!otpRecord.deliveredAt) {
    throw new ApiError(400, invalidMessage);
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
  const [otpRecord, pendingRegistration] = await Promise.all([
    authRepository.findLatestOtpByPhone(phone, "EMAIL_VERIFICATION"),
    authRepository.findPendingRegistrationByPhone(phone),
  ]);

  validateOtpRecord(otpRecord, now, "OTP not found.");
  if (
    !pendingRegistration?.email ||
    pendingRegistration.expiresAt <= now ||
    otpRecord.email !== pendingRegistration.email
  ) {
    throw new ApiError(400, "Pending registration has expired.");
  }
  const isValidOtp = await bcrypt.compare(otp, otpRecord.otpHash);

  if (!isValidOtp) {
    await authRepository.incrementOtpAttempts(
      otpRecord.id,
      otpRecord.maxAttempts,
    );
    throw new ApiError(401, "Invalid OTP.");
  }

  return authRepository.runTransaction(async (tx) => {
    const pending = await authRepository.findPendingRegistrationByPhone(
      phone,
      tx,
    );
    if (!pending || pending.expiresAt <= now) {
      throw new ApiError(400, "Pending registration has expired.");
    }
    if (!pending.email || otpRecord.email !== pending.email) {
      throw new ApiError(409, "Registration email has changed. Request a new code.");
    }
    if (!pending.termsVersion || !pending.privacyVersion) {
      throw new ApiError(
        409,
        "Legal acceptance is missing. Please restart registration.",
      );
    }
    if (await authRepository.findUserByPhone(phone, tx)) {
      throw new ApiError(409, "A user with this phone already exists.");
    }
    const claim = await authRepository.claimOtpVerification(
      otpRecord.id,
      now,
      otpRecord.maxAttempts,
      tx,
    );

    if (claim.count !== 1) {
      throw new ApiError(409, "OTP is no longer available.");
    }

    let user = await authRepository.createVerifiedUserFromPending(pending, tx);
    const wallet = await createWalletWithSignupBonus(user.id, tx);
    user = { ...user, wallet };
    await legalService.accept(
      user.id,
      {
        termsVersion: pending.termsVersion,
        privacyVersion: pending.privacyVersion,
      },
      tx,
    );
    await authRepository.deletePendingRegistration(phone, tx);
    const auth = await buildAuthResponse(user, tx);

    return {
      message: "OTP verified successfully",
      ...auth,
    };
  });
};

const forgotPassword = async (phone) => {
  const user = await authRepository.findUserByPhone(phone);

  if (user?.email && user.emailVerifiedAt) {
    try {
      await createAndDeliverOtp({
        phone,
        email: user.email,
        purpose: "PASSWORD_RESET",
      });
    } catch (error) {
      // Recovery requests deliberately keep one generic response to prevent
      // account and verification-state enumeration.
    }
  }

  return {
    message: "If the account is eligible, a reset code will be delivered.",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const resetPassword = async (phone, otp, newPassword) => {
  const now = new Date();
  const [user, otpRecord] = await Promise.all([
    authRepository.findUserByPhone(phone),
    authRepository.findLatestOtpByPhone(phone, "PASSWORD_RESET"),
  ]);

  if (
    !user?.email ||
    !user.emailVerifiedAt ||
    !otpRecord ||
    otpRecord.email !== user.email
  ) {
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

const requestAccountReactivationOtp = async (phone) => {
  const user = await authRepository.findUserWithPasswordByPhone(phone);
  if (
    user?.status === "DEACTIVATED" &&
    user.email &&
    user.emailVerifiedAt &&
    user.deletionScheduledAt &&
    user.deletionScheduledAt > new Date()
  ) {
    try {
      await createAndDeliverOtp({
        phone,
        email: user.email,
        purpose: "ACCOUNT_REACTIVATION",
      });
    } catch (error) {
      // Keep the request response indistinguishable for ineligible accounts.
    }
  }

  return {
    message:
      "If account recovery is available, a verification code will be delivered.",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const confirmAccountReactivation = async (phone, otp, password) => {
  const now = new Date();
  const [user, otpRecord] = await Promise.all([
    authRepository.findUserWithPasswordByPhone(phone),
    authRepository.findLatestOtpByPhone(phone, "ACCOUNT_REACTIVATION"),
  ]);

  if (
    !user?.passwordHash ||
    !user.email ||
    !user.emailVerifiedAt ||
    user.status !== "DEACTIVATED" ||
    !user.deletionScheduledAt ||
    user.deletionScheduledAt <= now ||
    !otpRecord ||
    otpRecord.email !== user.email
  ) {
    throw new ApiError(400, "Account recovery request is invalid or expired.");
  }

  validateOtpRecord(
    otpRecord,
    now,
    "Account recovery request is invalid or expired.",
  );
  const [validOtp, validPassword] = await Promise.all([
    bcrypt.compare(otp, otpRecord.otpHash),
    bcrypt.compare(password, user.passwordHash),
  ]);
  if (!validOtp) {
    await authRepository.incrementOtpAttempts(
      otpRecord.id,
      otpRecord.maxAttempts,
    );
    throw new ApiError(401, "Invalid verification code.");
  }
  if (!validPassword) {
    throw new ApiError(401, "Invalid phone or password.");
  }

  return authRepository.runTransaction(async (tx) => {
    const claim = await authRepository.claimOtpVerification(
      otpRecord.id,
      now,
      otpRecord.maxAttempts,
      tx,
    );
    if (claim.count !== 1) {
      throw new ApiError(409, "Verification code is no longer available.");
    }
    const reactivatedUser = await authRepository.reactivateUser(user.id, tx);
    const auth = await buildAuthResponse(reactivatedUser, tx);
    return {
      message:
        "Account deletion cancelled and account reactivated successfully.",
      ...auth,
    };
  });
};

const refresh = async (refreshToken, authorizeUser) => {
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

    if (authorizeUser) {
      await authorizeUser(storedToken.user);
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

const changePassword = async (
  userId,
  { currentPassword, newPassword, refreshToken },
) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const [user, storedToken] = await Promise.all([
    authRepository.findUserByIdWithPassword(userId),
    authRepository.findRefreshTokenByHash(tokenHash),
  ]);
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(401, "Current password is incorrect.");
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new ApiError(400, "New password must be different from the current password.");
  }
  if (
    !storedToken ||
    storedToken.userId !== userId ||
    storedToken.revokedAt ||
    storedToken.expiresAt <= new Date()
  ) {
    throw new ApiError(401, "Current refresh token is invalid or expired.");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await authRepository.runTransaction(async (tx) => {
    await authRepository.updateUserPassword(userId, passwordHash, tx);
    await authRepository.revokeOtherRefreshTokensForUser(
      userId,
      storedToken.id,
      tx,
    );
  });
  return { message: "Password changed successfully. Other sessions were signed out." };
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
  requestAccountReactivationOtp,
  confirmAccountReactivation,
  hashRefreshToken,
  changePassword,
  authenticatePassword,
  buildAuthResponse,
};
