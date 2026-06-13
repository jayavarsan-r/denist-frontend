const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { getQueue } = require('../jobs/queue');
const { notificationOrchestrator } = require('../services/notification-orchestrator.service');

const QUEUE_NAME = 'lab-timeouts';
const TERMINAL = ['RECEIVED', 'FITTED', 'CANCELLED'];
const RESOLVED = ['READY', 'DISPATCHED', 'RECEIVED', 'FITTED', 'CANCELLED'];

// Timeout jobs NEVER change a case's status — they nudge the lab and alert
// reception, nothing more. "Cancellation" of stale jobs is implicit: the worker
// re-reads the case and no-ops if it has moved on. Max one automated nudge per
// case per ~24h.
async function handleLabTimeout({ type, caseId, clinicId }) {
  const { data: labCase } = await supabase.from('lab_cases')
    .select('id, status, case_code')
    .eq('id', caseId).eq('clinic_id', clinicId).maybeSingle();
  if (!labCase || TERMINAL.includes(labCase.status)) return;

  const { data: lastNudges } = await supabase.from('lab_case_events')
    .select('created_at').eq('lab_case_id', caseId).eq('trigger', 'timeout_job')
    .order('created_at', { ascending: false }).limit(1);
  const hoursSince = lastNudges?.[0]
    ? (Date.now() - new Date(lastNudges[0].created_at).getTime()) / 3600000
    : Infinity;

  const inboxAlert = (alertType, extra = {}) => supabase.from('reception_inbox_items').insert({
    clinic_id: clinicId, type: alertType,
    payload: { caseId, caseCode: labCase.case_code, ...extra }, resolved: false,
  });

  if (type === 'nudge_ack' && labCase.status === 'SENT' && hoursSince >= 23) {
    await notificationOrchestrator.emit('lab_case_nudge', { caseId, clinicId });
    await logTimeoutEvent(caseId, 'nudge_ack');
  }

  if (type === 'pre_due_check' && !RESOLVED.includes(labCase.status)) {
    if (hoursSince >= 23) {
      await notificationOrchestrator.emit('lab_case_nudge', { caseId, clinicId });
      await logTimeoutEvent(caseId, 'pre_due_check');
    }
    await inboxAlert('lab_due_tomorrow');
  }

  if (type === 'overdue' && !RESOLVED.includes(labCase.status)) {
    if (hoursSince >= 23) {
      await notificationOrchestrator.emit('lab_case_nudge', { caseId, clinicId });
      await logTimeoutEvent(caseId, 'overdue');
    }
    await inboxAlert('lab_overdue', { severity: 'high' });
  }

  if (type === 'issue_stale' && labCase.status === 'ISSUE_RAISED') {
    await inboxAlert('lab_issue_stale');
  }
}

async function logTimeoutEvent(caseId, type) {
  await supabase.from('lab_case_events').insert({
    lab_case_id: caseId, trigger: 'timeout_job', to_status: 'NO_CHANGE', notes: type,
  });
}

async function registerLabTimeoutsWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handleLabTimeout(job.data);
  });
  logger.info('[lab-timeouts.worker] registered');
}

module.exports = { registerLabTimeoutsWorker, handleLabTimeout, QUEUE_NAME };
