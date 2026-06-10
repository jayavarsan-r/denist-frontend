const { ERROR_CODES, codeForStatus } = require('../utils/errors');
const logger = require('../utils/logger');

// Central error handler — emits the standard failure envelope:
//   { success: false, error: { code, message, details } }
module.exports = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Postgres / Supabase unique violation → 409 Conflict
  if (err.code === '23505') {
    status = 409;
    message = 'Resource already exists';
  }

  const code = err.code && ERROR_CODES[err.code] ? err.code : codeForStatus(status);

  if (status >= 500) {
    logger.error('Unhandled error', {
      ...logger.reqContext(req),
      err: err.message,
      pgcode: err.code,
    });
    if (process.env.NODE_ENV === 'production') {
      message = 'Internal server error';
      details = null;
    }
  }

  res.status(status).json({ success: false, error: { code, message, details } });
};
