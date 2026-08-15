const jwt = require("jsonwebtoken");

const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const getBearerToken = (req) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    throw new ApiError(401, "Authentication is required.");
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ApiError(401, "Invalid authorization header.");
  }

  return token;
};

const loadAuthenticatedUser = async (token) => {
  let payload;

  try {
    payload = jwt.verify(token, env.jwtAccessSecret);
  } catch (error) {
    throw new ApiError(401, "Invalid access token.");
  }

  if (payload.type !== "access" || !payload.userId) {
    throw new ApiError(401, "Invalid access token.");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: payload.userId,
    },
    select: {
      id: true,
      phone: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "Authenticated user was not found.");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "User is not active.");
  }

  return user;
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    req.user = await loadAuthenticatedUser(token);

    next();
  } catch (error) {
    next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      req.user = null;
      return next();
    }

    const token = getBearerToken(req);
    req.user = await loadAuthenticatedUser(token);

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  optionalAuth,
  requireAuth,
};
