// Google Sheet logging for clinic-day visibility / analytics — NOT a system of
// record and NEVER on the critical path.
//
// The whole consultation pipeline (upload → STT → Gemini → draft → verification →
// doctor workflow → UI) must keep working identically whether the sheet is fast,
// slow, rate-limited, mis-configured, or completely down. To guarantee that, every
// function here is FIRE-AND-FORGET:
//   - callers do NOT await it (and we never return the promise, so they can't),
//   - the POST is time-bounded (SHEETS_WEBHOOK_TIMEOUT_MS, default 2.5s),
//   - all errors are swallowed and logged as a single non-fatal warn.
//
// Transport is a Google Apps Script Web App: we POST a small JSON event and the
// script upserts a single row per Draft ID. No googleapis dependency, no
// service-account key to secure. Set SHEETS_WEBHOOK_URL to enable; leave it unset
// and every call becomes a silent no-op. See scripts/sheets-logger.gs.

const axios = require('axios');
const logger = require('../utils/logger');

// Read env at call time (not module load) so dotenv ordering can't disable us and
// tests can toggle the URL between cases.
function webhookUrl() {
  return process.env.SHEETS_WEBHOOK_URL || '';
}
function timeoutMs() {
  return Number(process.env.SHEETS_WEBHOOK_TIMEOUT_MS) || 2500;
}

let warnedDisabled = false;

// The single egress point. Detaches the POST onto a fresh microtask and attaches a
// catch so nothing here can ever reject into a caller's `await` or crash the worker.
function post(payload) {
  const url = webhookUrl();
  if (!url) {
    if (!warnedDisabled) {
      logger.info('[sheets-logger] SHEETS_WEBHOOK_URL not set — Google Sheet logging disabled');
      warnedDisabled = true;
    }
    return;
  }
  Promise.resolve()
    .then(() => axios.post(url, payload, {
      timeout: timeoutMs(),
      headers: { 'Content-Type': 'application/json' },
      // Cap the response we'll buffer — the Apps Script returns a tiny ack.
      maxContentLength: 64 * 1024,
    }))
    .catch((err) => {
      logger.warn('[sheets-logger] append failed (non-fatal)', {
        type: payload && payload.type, draftId: (payload && payload.draftId) || null,
        error: (err && err.message) || String(err),
      });
    });
  // Intentionally return nothing: callers must not be able to block on this.
}

// One row per AI run, written when the pipeline finishes (success OR failure). The
// Apps Script fills the Draft ID / Success / STT / Gemini / Notes columns.
//   stt    = { duration, chunks, emptyChunks, transcriptLength, timeMs }
//   gemini = { timeMs, keyUsed, salvageUsed, droppedFields }
function logConsultationRun({ draftId, clinicId, queueEntryId, jobId, attemptNumber, stt, gemini, success, notes } = {}) {
  if (!draftId) return;
  post({
    type: 'run',
    ts: new Date().toISOString(),
    draftId,
    clinicId: clinicId || null,
    queueEntryId: queueEntryId || null,
    jobId: jobId != null ? String(jobId) : null,
    attemptNumber: attemptNumber || null,
    success: !!success,
    stt: stt || null,
    gemini: gemini || null,
    notes: notes || '',
  });
}

// Updates the Doctor Edit column on the existing row for this draft, fired when the
// doctor confirms (queue path) or reviews (profile path) the draft.
function logVerification({ draftId, clinicId, doctorEdited, editedFields } = {}) {
  if (!draftId) return;
  post({
    type: 'verify',
    ts: new Date().toISOString(),
    draftId,
    clinicId: clinicId || null,
    doctorEdited: !!doctorEdited,
    editedFields: Array.isArray(editedFields) ? editedFields : [],
  });
}

module.exports = { logConsultationRun, logVerification };
