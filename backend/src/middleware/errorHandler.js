const { logger } = require('../utils/logger');

module.exports = (err, req, res, next) => {
  if (err.isAppError) {
    // Known application error — no stack trace needed
    logger.warn(err.message, { code: err.code, requestId: req.requestId, path: req.path });
    const body = { success: false, error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  // Unknown/unexpected error — log full stack, sanitize response
  logger.error(err.message, {
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });

  // Supabase constraint violations (23505 = unique, 23503 = foreign key, etc.)
  const pgCode = err.code;
  if (pgCode === '23505') {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with this value already exists' } });
  }
  if (pgCode === '23503') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_REFERENCE', message: 'Referenced record does not exist' } });
  }

  return res.status(err.status || 500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};
