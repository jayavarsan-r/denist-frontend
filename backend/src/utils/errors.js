// AppError — throw from anywhere; errorHandler.js catches and formats it

class AppError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.isAppError = true;
  }
}

const Errors = {
  unauthorized: (msg = 'Authentication required') =>
    new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Access denied') =>
    new AppError('FORBIDDEN', msg, 403),
  notFound: (entity = 'Resource') =>
    new AppError('NOT_FOUND', `${entity} not found`, 404),
  conflict: (msg) =>
    new AppError('CONFLICT', msg, 409),
  validation: (msg, details = null) =>
    new AppError('VALIDATION_ERROR', msg, 400, details),
  internal: (msg = 'Internal server error') =>
    new AppError('INTERNAL_ERROR', msg, 500),
};

module.exports = { AppError, Errors };
