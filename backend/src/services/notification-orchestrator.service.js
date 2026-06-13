const supabase = require('../config/supabase');
const logger = require('../utils/logger');

// Notification Orchestrator — the ONLY place in the codebase that calls
// whatsapp.sendTemplate(). Every other service emits an event:
//
//   await notificationOrchestrator.emit('lab_case_new', { caseId, clinicId });
//
// emit() enqueues to the whatsapp-outbound pg-boss queue (never sends inline);
// the worker calls handleNotificationEvent(). Feature flags gate actual sending:
// FEATURE_WHATSAPP_PATIENT_REMINDERS / FEATURE_WHATSAPP_LAB_OUTBOUND — flip them
// when the BSP is live and templates are approved; no code change.

// Template key → approved BSP template names per language.
const TEMPLATES = {
  // Patient-facing (gated by FEATURE_WHATSAPP_PATIENT_REMINDERS)
  appt_reminder_24h:      { en: 'dentai_appt_reminder_24h_en', ta: 'dentai_appt_reminder_24h_ta', audience: 'patient' },
  appt_reminder_2h:       { en: 'dentai_appt_reminder_2h_en', ta: 'dentai_appt_reminder_2h_ta', audience: 'patient' },
  appt_confirmed:         { en: 'dentai_appt_confirmed_en', ta: 'dentai_appt_confirmed_ta', audience: 'patient' },
  payment_receipt:        { en: 'dentai_payment_receipt_en', ta: 'dentai_payment_receipt_ta', audience: 'patient' },
  lab_case_patient_ready: { en: 'dentai_crown_ready_en', ta: 'dentai_crown_ready_ta', audience: 'patient' },
  eod_summary:            { en: 'dentai_eod_summary_en', audience: 'patient' }, // owner's personal number

  // Lab-facing (gated by FEATURE_WHATSAPP_LAB_OUTBOUND)
  lab_case_new:           { en: 'dentai_lab_new_en', ta: 'dentai_lab_new_ta', audience: 'lab' },
  lab_case_nudge:         { en: 'dentai_lab_nudge_en', ta: 'dentai_lab_nudge_ta', audience: 'lab' },
  lab_case_received:      { en: 'dentai_lab_received_en', audience: 'lab' },
};

function flagAllows(templateKey) {
  const audience = TEMPLATES[templateKey]?.audience;
  if (audience === 'patient') return process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS === 'true';
  if (audience === 'lab') return process.env.FEATURE_WHATSAPP_LAB_OUTBOUND === 'true';
  return false;
}

// Core send: flag check → provider → notification_logs row (existing table shape).
async function send({ to, templateKey, language, components, mediaUrl, clinicId, patientId, referenceId }) {
  if (!flagAllows(templateKey)) {
    logger.info('[orchestrator] feature flag off — built but not sent', { templateKey });
    return { success: true, skipped: 'feature_flag' };
  }
  const map = TEMPLATES[templateKey];
  if (!map) throw new Error(`Unknown template key: ${templateKey}`);
  const templateName = map[language || 'en'] || map.en;

  const { getWhatsAppProvider } = require('../providers/whatsapp');
  const provider = getWhatsAppProvider();
  const result = await provider.sendTemplate(to, templateName, components, mediaUrl);

  await supabase.from('notification_logs').insert({
    clinic_id: clinicId,
    patient_id: patientId || null,
    type: templateKey,
    channel: 'whatsapp',
    recipient: to,
    payload: { templateName, components, mediaUrl: mediaUrl || null, referenceId: referenceId || null },
    status: result.success ? 'sent' : 'failed',
    provider: process.env.WHATSAPP_PROVIDER || 'stub',
    provider_message_id: result.messageId || null,
    error: result.error || null,
    sent_at: result.success ? new Date().toISOString() : null,
  });

  if (!result.success) throw new Error(`whatsapp_send_failed: ${result.error}`); // pg-boss retries
  return result;
}

// ── Context helpers ───────────────────────────────────────────────────────────

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

async function getPatient(patientId, clinicId) {
  const { data } = await supabase.from('patients')
    .select('id, name, phone, preferred_language, whatsapp_opted_in')
    .eq('id', patientId).eq('clinic_id', clinicId).maybeSingle();
  return data;
}

async function getClinic(clinicId) {
  const { data } = await supabase.from('clinics')
    .select('name, whatsapp_number, owner_phone').eq('id', clinicId).maybeSingle();
  return data;
}

async function getLabCase(caseId, clinicId, select = '*, labs(*), patients(name, phone)') {
  const { data } = await supabase.from('lab_cases')
    .select(select).eq('id', caseId).eq('clinic_id', clinicId).maybeSingle();
  return data;
}

// ── Event handlers (run inside the whatsapp-outbound worker) ─────────────────

const HANDLERS = {
  // payload: { patientId, clinicId, appointmentId, date 'YYYY-MM-DD', time 'HH:MM', type? '24h'|'2h' }
  appointment_reminder: async (p) => {
    const patient = await getPatient(p.patientId, p.clinicId);
    if (!patient?.phone || !patient.whatsapp_opted_in) return;
    const clinic = await getClinic(p.clinicId);
    await send({
      to: patient.phone,
      templateKey: p.type === '2h' ? 'appt_reminder_2h' : 'appt_reminder_24h',
      language: patient.preferred_language,
      components: [clinic?.name || 'Your clinic', fmtDate(p.date), p.time || ''],
      clinicId: p.clinicId, patientId: patient.id, referenceId: p.appointmentId,
    });
  },

  // payload: { patientId, clinicId, appointmentId, date, time, doctorName? }
  appointment_confirmed: async (p) => {
    const patient = await getPatient(p.patientId, p.clinicId);
    if (!patient?.phone || !patient.whatsapp_opted_in) return;
    const clinic = await getClinic(p.clinicId);
    await send({
      to: patient.phone, templateKey: 'appt_confirmed', language: patient.preferred_language,
      components: [clinic?.name || 'Your clinic', fmtDate(p.date), p.time || '', p.doctorName || 'your doctor'],
      clinicId: p.clinicId, patientId: patient.id, referenceId: p.appointmentId,
    });
  },

  // payload: { patientId, clinicId, amount, paymentId }
  payment_receipt: async (p) => {
    const patient = await getPatient(p.patientId, p.clinicId);
    if (!patient?.phone || !patient.whatsapp_opted_in) return;
    const clinic = await getClinic(p.clinicId);
    await send({
      to: patient.phone, templateKey: 'payment_receipt', language: patient.preferred_language,
      components: [clinic?.name || 'Your clinic', `₹${p.amount}`, new Date().toLocaleDateString('en-IN')],
      clinicId: p.clinicId, patientId: patient.id, referenceId: p.paymentId,
    });
  },

  // payload: { caseId, clinicId } — case just moved to SENT
  lab_case_new: async (p) => {
    const labCase = await getLabCase(p.caseId, p.clinicId);
    if (!labCase?.lab_id || !labCase.labs || labCase.labs.automation_paused) return;
    const labPhone = labCase.labs.phone_numbers?.[0];
    if (!labPhone) return;
    const clinic = await getClinic(p.clinicId);

    // First attached photo (impression/shade) rides along when present.
    let mediaUrl = null;
    try {
      const { data: files } = await supabase.from('lab_case_files')
        .select('storage_path').eq('lab_case_id', p.caseId).limit(1);
      if (files?.[0]) {
        const { data: signed } = await supabase.storage.from('lab-docs')
          .createSignedUrl(files[0].storage_path, 7 * 24 * 3600);
        mediaUrl = signed?.signedUrl || null;
      }
    } catch { /* media optional */ }

    const initials = (labCase.patients?.name || 'PT').split(/\s+/).map((w) => w[0]).join('').toUpperCase();
    await send({
      to: labPhone, templateKey: 'lab_case_new', language: labCase.labs.preferred_language,
      components: [
        clinic?.name || '', labCase.case_code, labCase.case_type,
        (labCase.tooth_fdi || []).join(', ') || '—', labCase.shade || '—', initials,
        labCase.expected_date ? new Date(labCase.expected_date).toLocaleDateString('en-IN') : '—',
        labCase.instructions || '—',
        // Quick-reply payloads: tier-1 deterministic parsing on the way back in.
        JSON.stringify({ action: 'status', case_id: p.caseId, to: 'ACKNOWLEDGED' }),
        JSON.stringify({ action: 'status', case_id: p.caseId, to: 'ISSUE_RAISED' }),
      ],
      mediaUrl, clinicId: p.clinicId, referenceId: p.caseId,
    });

    await supabase.from('lab_messages').insert({
      clinic_id: p.clinicId, lab_id: labCase.lab_id, lab_case_id: p.caseId,
      direction: 'outbound', body: `New case ${labCase.case_code} sent to lab`, resolved: true,
    });
  },

  // payload: { caseId, clinicId } — chase an unresponsive lab
  lab_case_nudge: async (p) => {
    const labCase = await getLabCase(p.caseId, p.clinicId, '*, labs(*)');
    if (!labCase?.labs || labCase.labs.automation_paused) return;
    const labPhone = labCase.labs.phone_numbers?.[0];
    if (!labPhone) return;
    await send({
      to: labPhone, templateKey: 'lab_case_nudge', language: labCase.labs.preferred_language,
      components: [
        labCase.case_code, labCase.case_type, (labCase.tooth_fdi || []).join(', ') || '—',
        JSON.stringify({ action: 'status', case_id: p.caseId, to: 'IN_PROGRESS' }),
        JSON.stringify({ action: 'status', case_id: p.caseId, to: 'READY' }),
        JSON.stringify({ action: 'status', case_id: p.caseId, to: 'ISSUE_RAISED' }),
      ],
      clinicId: p.clinicId, referenceId: p.caseId,
    });
  },

  // payload: { caseId, clinicId } — work is READY, tell the patient
  lab_case_ready_patient: async (p) => {
    const labCase = await getLabCase(p.caseId, p.clinicId, 'patient_id, case_type');
    if (!labCase) return;
    const patient = await getPatient(labCase.patient_id, p.clinicId);
    if (!patient?.phone || !patient.whatsapp_opted_in) return;
    const clinic = await getClinic(p.clinicId);
    await send({
      to: patient.phone, templateKey: 'lab_case_patient_ready', language: patient.preferred_language,
      components: [clinic?.name || '', labCase.case_type],
      clinicId: p.clinicId, patientId: patient.id, referenceId: p.caseId,
    });
  },

  // payload: { caseId, clinicId } — thanks/closure to the lab on RECEIVED
  lab_case_received_thanks: async (p) => {
    const labCase = await getLabCase(p.caseId, p.clinicId, 'case_code, labs(phone_numbers, preferred_language, automation_paused)');
    if (!labCase?.labs || labCase.labs.automation_paused) return;
    const labPhone = labCase.labs.phone_numbers?.[0];
    if (!labPhone) return;
    const clinic = await getClinic(p.clinicId);
    await send({
      to: labPhone, templateKey: 'lab_case_received', language: labCase.labs.preferred_language,
      components: [labCase.case_code, clinic?.name || ''],
      clinicId: p.clinicId, referenceId: p.caseId,
    });
  },

  // payload: { clinicId, summaryText, ownerPhone }
  eod_summary: async (p) => {
    if (!p.ownerPhone) return;
    await send({
      to: p.ownerPhone, templateKey: 'eod_summary', language: 'en',
      components: [p.summaryText], clinicId: p.clinicId,
    });
  },
};

// emit(): enqueue for the outbound worker. Degrades to a logged no-op when the
// job queue is unavailable (DATABASE_URL missing in dev) — a notification must
// never break the workflow that triggered it.
const notificationOrchestrator = {
  async emit(event, payload) {
    try {
      const { getQueue, isQueueAvailable } = require('../jobs/queue');
      if (!isQueueAvailable()) {
        logger.warn('[orchestrator] queue unavailable — notification dropped', { event });
        return;
      }
      await getQueue().send('whatsapp-outbound', { event, payload }, { retryLimit: 3, retryDelay: 60 });
    } catch (e) {
      logger.error('[orchestrator] emit failed (non-fatal)', { event, err: e.message });
    }
  },
};

async function handleNotificationEvent(event, payload) {
  const handler = HANDLERS[event];
  if (!handler) {
    logger.warn('[orchestrator] no handler for event', { event });
    return;
  }
  await handler(payload);
}

module.exports = { notificationOrchestrator, handleNotificationEvent, TEMPLATES, flagAllows };
