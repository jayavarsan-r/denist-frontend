const crypto = require('crypto');

// Attach a stable request id (from an upstream header if present, else generated)
// and echo it back so clients/logs can correlate a request end-to-end.
module.exports = (req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
