// Typed application errors + canonical error codes used in the response envelope.

const ERROR_CODES = {
  VALIDATION_ERROR: { status: 400 },
  UNAUTHORIZED:     { status: 401 },
  FORBIDDEN:        { status: 403 },
  NOT_FOUND:        { status: 404 },
  CONFLICT:         { status: 409 },
  RATE_LIMITED:     { status: 429 },
  AI_UNAVAILABLE:   { status: 503 },
  AI_TIMEOUT:       { status: 504 },
  AI_PARSE_ERROR:   { status: 502 },
  INTERNAL:         { status: 500 },
};

class AppError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = (ERROR_CODES[code] && ERROR_CODES[code].status) || 500;
    this.details = details;
  }
}

// Convenience constructors
const badRequest   = (msg, details) => new AppError('VALIDATION_ERROR', msg || 'Invalid request', details);
const unauthorized = (msg)          => new AppError('UNAUTHORIZED', msg || 'Unauthorized');
const forbidden    = (msg)          => new AppError('FORBIDDEN', msg || 'Forbidden');
const notFound     = (msg)          => new AppError('NOT_FOUND', msg || 'Not found');
const conflict     = (msg, details) => new AppError('CONFLICT', msg || 'Conflict', details);

// Map an arbitrary status code to a canonical error code (used by the envelope
// middleware when legacy routes call res.status(4xx).json({ error })).
function codeForStatus(status) {
  switch (status) {
    case 400: return 'VALIDATION_ERROR';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'RATE_LIMITED';
    case 503: return 'AI_UNAVAILABLE';
    case 504: return 'AI_TIMEOUT';
    case 502: return 'AI_PARSE_ERROR';
    default:  return status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR';
  }
}

module.exports = {
  AppError, ERROR_CODES, codeForStatus,
  badRequest, unauthorized, forbidden, notFound, conflict,
};
