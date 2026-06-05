const repos = require('../repositories');
const logger = require('../utils/logger');

// Append-only audit logging. Best-effort by design: an audit failure must NEVER
// fail the business operation, so every write is wrapped and swallowed (logged).
async function log({ clinicId, staffId, action, entityType, entityId, metadata, requestId }) {
  try {
    await repos.auditLogs.create({
      clinic_id: clinicId || null,
      staff_id: staffId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: metadata || null,
      request_id: requestId || null,
    });
  } catch (e) {
    logger.warn('audit log failed (non-fatal)', { action, entityType, err: e.message });
  }
}

// Build args from a request context.
function fromReq(req, { action, entityType, entityId, metadata }) {
  return log({
    clinicId: req.clinicId,
    staffId: req.staffId,
    action,
    entityType,
    entityId,
    metadata,
    requestId: req.id,
  });
}

module.exports = { log, fromReq };
