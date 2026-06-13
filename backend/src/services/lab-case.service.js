const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { notificationOrchestrator } = require('./notification-orchestrator.service');

// The lab case state machine. The DATABASE is the truth — WhatsApp messages,
// buttons, LLM parses and timeout jobs are all just triggers that ask for a
// transition; anything invalid is rejected here, in one place.
const VALID_TRANSITIONS = {
  DRAFT:        ['SENT', 'CANCELLED'],
  SENT:         ['ACKNOWLEDGED', 'ISSUE_RAISED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'ISSUE_RAISED', 'CANCELLED'],
  IN_PROGRESS:  ['READY', 'ISSUE_RAISED', 'CANCELLED'],
  READY:        ['DISPATCHED', 'ISSUE_RAISED'],
  ISSUE_RAISED: ['IN_PROGRESS', 'CANCELLED'],
  DISPATCHED:   ['RECEIVED'],
  RECEIVED:     ['FITTED'],
  FITTED:       [],
  CANCELLED:    [],
};
const STATUSES = Object.keys(VALID_TRANSITIONS);

// transitionLabCase — validate, apply (compare-and-swap on the current status so
// two concurrent triggers can't double-apply), audit, fire side effects.
// Backward/corrective moves are allowed ONLY for reception_manual.
async function transitionLabCase(caseId, toStatus, trigger, sourceMessageId, clinicId) {
  if (!STATUSES.includes(toStatus)) throw new Error(`unknown_status: ${toStatus}`);

  const { data: labCase, error } = await supabase.from('lab_cases')
    .select('id, status, lab_id, patient_id, expected_date, case_code')
    .eq('id', caseId).eq('clinic_id', clinicId).maybeSingle();
  if (error || !labCase) throw new Error('lab_case_not_found');

  // Idempotent: replayed webhooks / double taps are no-ops.
  if (labCase.status === toStatus) return labCase;

  const valid = VALID_TRANSITIONS[labCase.status] || [];
  if (!valid.includes(toStatus) && trigger !== 'reception_manual') {
    throw new Error(`invalid_transition: ${labCase.status} → ${toStatus} (trigger: ${trigger})`);
  }

  // Compare-and-swap: the update only lands if status is still what we read.
  const { data: updated, error: updateErr } = await supabase.from('lab_cases')
    .update({
      status: toStatus,
      status_updated_at: new Date().toISOString(),
      status_updated_by: trigger,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId).eq('clinic_id', clinicId).eq('status', labCase.status)
    .select().maybeSingle();
  if (updateErr) throw updateErr;
  if (!updated) {
    // Lost a race — another trigger moved the case first. Treat as a no-op
    // rather than corrupting the audit trail.
    logger.warn('[lab-case] transition raced, skipped', { caseId, from: labCase.status, to: toStatus, trigger });
    return labCase;
  }

  await supabase.from('lab_case_events').insert({
    lab_case_id: caseId,
    from_status: labCase.status,
    to_status: toStatus,
    trigger,
    source_message_id: sourceMessageId || null,
  });

  // Side effects are fire-and-forget — a notification failure must never undo
  // or block a state change.
  handleSideEffects(caseId, clinicId, toStatus, updated).catch((e) =>
    logger.error('[lab-case] side effect failed', { caseId, toStatus, err: e.message }));

  return updated;
}

async function handleSideEffects(caseId, clinicId, toStatus, labCase) {
  if (toStatus === 'SENT') {
    await notificationOrchestrator.emit('lab_case_new', { caseId, clinicId });
    await scheduleLabTimeouts(caseId, clinicId, labCase.expected_date);
  }
  if (toStatus === 'READY') {
    await notificationOrchestrator.emit('lab_case_ready_patient', { caseId, clinicId });
  }
  if (toStatus === 'RECEIVED') {
    await notificationOrchestrator.emit('lab_case_received_thanks', { caseId, clinicId });
  }
  if (toStatus === 'ISSUE_RAISED') {
    // If the issue sits unhandled for 24h, surface it to reception.
    await scheduleTimeout(caseId, clinicId, 'issue_stale', new Date(Date.now() + 24 * 3600 * 1000));
  }
}

// Timeout jobs NEVER change status — the worker re-checks the case and only
// nudges/alerts. pg-boss has no cancel-by-data, so "cancellation" is the worker
// seeing a resolved status and doing nothing.
async function scheduleTimeout(caseId, clinicId, type, startAfter) {
  try {
    const { getQueue, isQueueAvailable } = require('../jobs/queue');
    if (!isQueueAvailable()) return;
    await getQueue().send('lab-timeouts', { type, caseId, clinicId }, { startAfter });
  } catch (e) {
    logger.warn('[lab-case] timeout scheduling failed (non-fatal)', { caseId, type, err: e.message });
  }
}

async function scheduleLabTimeouts(caseId, clinicId, expectedDate) {
  await scheduleTimeout(caseId, clinicId, 'nudge_ack', new Date(Date.now() + 24 * 3600 * 1000));
  if (expectedDate) {
    const due = new Date(expectedDate);
    const preDue = new Date(due);
    preDue.setDate(preDue.getDate() - 1);
    if (preDue > new Date()) await scheduleTimeout(caseId, clinicId, 'pre_due_check', preDue);
    await scheduleTimeout(caseId, clinicId, 'overdue', due);
  }
}

// 'Sunrise Dental' → 'SR-0042'. Sequence is instance-wide; the clinic prefix +
// UNIQUE(clinic_id, case_code) keep codes collision-free and short enough for
// a lab to type back in a WhatsApp message.
async function generateCaseCode(clinicId) {
  const { data: clinic } = await supabase.from('clinics')
    .select('name').eq('id', clinicId).maybeSingle();
  const prefix = (clinic?.name || 'DC').replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() || 'DC';
  let seq = null;
  try {
    const { data } = await supabase.rpc('nextval_lab_case_code_seq');
    seq = data;
  } catch { /* fall through */ }
  if (seq == null) seq = Math.floor(Math.random() * 9000) + 1000; // pre-migration fallback
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

// Tamil + English keyword map — tier 2 of the inbound parser.
function inferStatusFromKeywords(text) {
  const t = String(text || '').toLowerCase();
  if (/(ready|\bdone\b|finished|complete|aachu|முடிந்தது|தயார்|finish)/.test(t)) return 'READY';
  if (/(problem|issue|remake|redo|reject|பிரச்சனை|மறு)/.test(t)) return 'ISSUE_RAISED';
  if (/(dispatched|courier|pickup|dispatch|\bsent\b|அனுப்பி)/.test(t)) return 'DISPATCHED';
  if (/(in progress|working|\bwip\b|process|started)/.test(t)) return 'IN_PROGRESS';
  if (/(received|got it|\bok\b|acknowledged|\bgot\b)/.test(t)) return 'ACKNOWLEDGED';
  return null;
}

module.exports = {
  transitionLabCase, generateCaseCode, inferStatusFromKeywords,
  scheduleLabTimeouts, VALID_TRANSITIONS, STATUSES,
};
