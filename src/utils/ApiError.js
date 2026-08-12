// The purpose: instead of throwing a generic error, we create a custom error class that extends the built-in Error class. This allows us to add additional properties and methods to the error object, such as a status code and an array of errors. This is useful for handling errors in a more structured way and providing more information to the client.
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
