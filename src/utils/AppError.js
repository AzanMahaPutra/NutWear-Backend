/**
 * Custom error class supaya service/repository bisa melempar error
 * dengan statusCode HTTP yang jelas, ditangkap oleh errorHandler middleware global.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
