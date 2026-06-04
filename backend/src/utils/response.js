// Standard response helpers — all endpoints use these, never res.json() directly

function ok(res, data, meta = null) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
}

function okCreated(res, data) {
  return res.status(201).json({ success: true, data });
}

function okPaginated(res, data, meta) {
  return res.json({ success: true, data, meta });
}

function fail(res, status, code, message, details = null) {
  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

module.exports = { ok, okCreated, okPaginated, fail };
