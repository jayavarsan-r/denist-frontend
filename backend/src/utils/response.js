const { codeForStatus } = require('./errors');

// Explicit helpers (use these in new code).
function ok(res, data = null, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, code, message, details = null, status) {
  return res
    .status(status || 400)
    .json({ success: false, error: { code, message, details } });
}

function isEnvelope(body) {
  return body && typeof body === 'object' && 'success' in body &&
    ('data' in body || 'error' in body);
}

// Global response-shaping middleware. Monkeypatches res.json so EVERY endpoint
// emits the standard envelope without each route being rewritten:
//   - already-enveloped bodies pass through untouched
//   - status >= 400 with a legacy { error } body  -> { success:false, error:{...} }
//   - everything else                             -> { success:true, data: body }
// After the frontend interceptor unwraps `data`, each service receives exactly the
// same object it did before this change (backward compatible).
function responseEnvelope(req, res, next) {
  const rawJson = res.json.bind(res);
  res.json = (body) => {
    if (isEnvelope(body)) return rawJson(body);

    const status = res.statusCode || 200;
    if (status >= 400) {
      const message =
        body && typeof body === 'object' && body.error
          ? body.error
          : (typeof body === 'string' ? body : 'Request failed');
      const details =
        body && typeof body === 'object' && body.details ? body.details : null;
      return rawJson({ success: false, error: { code: codeForStatus(status), message, details } });
    }
    return rawJson({ success: true, data: body });
  };
  next();
}

module.exports = { ok, fail, responseEnvelope, isEnvelope };
