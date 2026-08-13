const ApiError = require("../utils/ApiError");

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let errors = err.errors || [];

  if (err.code === "P2002") {
    statusCode = 409;
    message = "A record with this value already exists.";
  }

  if (err.code === "P2025") {
    statusCode = 404;
    message = "Requested record was not found.";
  }

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
