const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { getQueue } = require('../jobs/queue');
const { normalisePhone } = require('../providers/whatsapp');
const { transitionLabCase, inferStatusFromKeywords } = require('../services/lab-case.service');
const { classifyLabMessage } = require('../services/lab-message-classifier.service');

const QUEUE_NAME = 'whatsapp-inbound';

// ── BSP payload normalisation (Meta Cloud API shape) ──────────────────────────
// Returns null for non-message events (delivery receipts etc.). Adapt here when
// the real BSP's webhook format is confirmed — everything downstream is
// BSP-agnostic.
function normaliseBspPayload(payload) {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const isButton = msg.type === 'interactive' && msg.interactive?.type === 'button_reply';
    const mediaUrls = [];
    if (msg.image?.id) mediaUrls.push(`https://graph.facebook.com/v18.0/${msg.image.id}`);
    if (msg.document?.id) mediaUrls.push(`https://graph.facebook.com/v18.0/${msg.document.id}`);

    return {
      from: msg.from,
      // the clinic's WABA number — how we know WHICH clinic this message is for
      to: value?.metadata?.display_phone_number || value?.metadata?.phone_number_id || '',
      body: msg.text?.body ?? msg.interactive?.button_reply?.title ?? null,
      mediaUrls,
      messageId: msg.id,
      isButton,
      buttonPayload: isButton ? (msg.interactive.button_reply.id || msg.interactive.button_reply.payload) : null,
    };
  } catch {
    return null;
  }
}

// ── Lab message — four descending tiers ───────────────────────────────────────
// 1 button payload → 2 case-code + keyword → 3 Gemini (≥0.85) → 4 reception inbox.
// The message row is saved FIRST, before any parsing — nothing is ever lost.
async function processLabMessage({ clinicId, lab, body, mediaUrls, messageId, isButton, buttonPayload }) {
  const { data: msg, error: insErr } = await supabase.from('lab_messages')
    .insert({
      clinic_id: clinicId, lab_id: lab.id, direction: 'inbound',
      wa_message_id: messageId || null, body: body || null,
      media_paths: mediaUrls || [], resolved: false,
    })
    .select().maybeSingle();
  if (insErr?.code === '23505') return; // replayed webhook — already processed (idempotency)
  if (!msg) return;

  const linkAndResolve = (caseId, tier, confidence) =>
    supabase.from('lab_messages')
      .update({ lab_case_id: caseId, parse_tier: tier, parse_confidence: confidence ?? null, resolved: true })
      .eq('id', msg.id);

  // TIER 1 — quick-reply button payload (deterministic)
  if (isButton && buttonPayload) {
    try {
      const parsed = typeof buttonPayload === 'string' ? JSON.parse(buttonPayload) : buttonPayload;
      if (parsed?.action === 'status' && parsed.case_id && parsed.to) {
        await transitionLabCase(parsed.case_id, parsed.to, 'lab_button', msg.id, clinicId);
        await linkAndResolve(parsed.case_id, 'button', 1);
        if (mediaUrls?.length) await attachMediaToCase(parsed.case_id, mediaUrls, clinicId);
        return;
      }
    } catch (e) {
      logger.warn('[inbound tier1] bad button payload — falling through', { err: e.message });
    }
  }

  const text = (body || '').trim();

  // TIER 2 — case code in the text + keyword status
  const codeMatch = text.match(/\b([A-Z]{2,3}-\d{3,5})\b/i);
  if (codeMatch) {
    const caseCode = codeMatch[1].toUpperCase();
    const { data: labCase } = await supabase.from('lab_cases')
      .select('id, status').eq('clinic_id', clinicId).eq('case_code', caseCode).maybeSingle();
    if (labCase) {
      const newStatus = inferStatusFromKeywords(text);
      if (newStatus) {
        try {
          await transitionLabCase(labCase.id, newStatus, 'case_code_text', msg.id, clinicId);
        } catch (e) {
          // Invalid transition (e.g. "ready" on a RECEIVED case) — keep the
          // message linked; reception sees it in context on the case timeline.
          logger.warn('[inbound tier2] transition rejected', { caseCode, newStatus, err: e.message });
        }
      }
      // Code matched → always link + attach media, even without a keyword.
      await linkAndResolve(labCase.id, 'case_code', newStatus ? 0.95 : null);
      if (mediaUrls?.length) await attachMediaToCase(labCase.id, mediaUrls, clinicId);
      return;
    }
  }

  // TIER 3 — Gemini fallback, only against THIS lab's open cases, only ≥0.85
  if (text && !lab.automation_paused) {
    const { data: openCases } = await supabase.from('lab_cases')
      .select('id, case_code, case_type, tooth_fdi, status')
      .eq('clinic_id', clinicId).eq('lab_id', lab.id)
      .not('status', 'in', '(FITTED,CANCELLED)')
      .limit(10);
    if (openCases?.length) {
      const c = await classifyLabMessage(text, openCases);
      if (c.case_id && c.new_status && c.confidence >= 0.85) {
        try {
          await transitionLabCase(c.case_id, c.new_status, 'llm_parse', msg.id, clinicId);
          await linkAndResolve(c.case_id, 'llm', c.confidence);
          if (mediaUrls?.length) await attachMediaToCase(c.case_id, mediaUrls, clinicId);
          return;
        } catch (e) {
          logger.warn('[inbound tier3] transition rejected — falling to inbox', { err: e.message });
        }
      }
    }
  }

  // TIER 4 — reception inbox: the unbreakable floor. Message stays unresolved.
  const preview = text.slice(0, 100) || (mediaUrls?.length ? `[${mediaUrls.length} photo(s)]` : '[empty]');
  await notifyReceptionInbox(clinicId, {
    type: 'unresolved_lab_message',
    messageId: msg.id, labId: lab.id, labName: lab.name,
    preview, hasMedia: (mediaUrls?.length || 0) > 0,
  });
}

// Patients (Phase 4 v1): everything goes to the reception inbox. A booking bot
// can take over this branch later without touching the routing.
async function processPatientMessage({ clinicId, patient, body, messageId }) {
  await notifyReceptionInbox(clinicId, {
    type: 'patient_message',
    patient: { id: patient.id, name: patient.name, phone: patient.phone },
    body: (body || '').slice(0, 200), messageId,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function attachMediaToCase(caseId, mediaUrls, clinicId) {
  for (const url of mediaUrls) {
    try {
      // NOTE: Meta media URLs need an access-token fetch; the BSP-specific
      // download belongs in the provider when a real BSP is wired. Until then
      // we record the reference so nothing is lost.
      const res = await fetch(url).catch(() => null);
      if (res?.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const path = `${clinicId}/${caseId}/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from('lab-docs')
          .upload(path, buf, { contentType: 'image/jpeg' });
        if (!error) {
          await supabase.from('lab_case_files').insert({
            lab_case_id: caseId, clinic_id: clinicId, storage_path: path,
            kind: 'result_photo', source: 'lab_whatsapp',
          });
          continue;
        }
      }
      // Download failed — keep the URL on the message (already in media_paths).
      logger.warn('[inbound] media download failed — URL kept on lab_messages', { caseId });
    } catch (e) {
      logger.warn('[inbound] attachMedia error', { err: e.message });
    }
  }
}

async function upsertSessionWindow(clinicId, phone) {
  try {
    await supabase.from('whatsapp_sessions').upsert({
      clinic_id: clinicId, phone, direction: 'inbound',
      opened_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'clinic_id,phone' });
  } catch { /* non-fatal */ }
}

async function notifyReceptionInbox(clinicId, data) {
  try {
    await supabase.from('reception_inbox_items').insert({
      clinic_id: clinicId, type: data.type, payload: data, resolved: false,
    });
  } catch (e) {
    logger.error('[inbound] reception inbox write failed', { err: e.message });
  }
}

// ── Main job handler ──────────────────────────────────────────────────────────
async function handleInboundJob({ payload }) {
  const parsed = normaliseBspPayload(payload);
  if (!parsed) return; // delivery/status event — not a message

  // Which clinic? Each clinic has its own WABA number.
  const { data: clinic } = await supabase.from('clinics')
    .select('id').eq('whatsapp_number', parsed.to).maybeSingle();
  if (!clinic) {
    logger.warn('[inbound] no clinic for WhatsApp number', { to: parsed.to });
    return;
  }
  const clinicId = clinic.id;
  const from = normalisePhone(parsed.from);

  await upsertSessionWindow(clinicId, from);

  // Route by sender: labs (any of their numbers) → patients → unknown.
  const { data: labs } = await supabase.from('labs')
    .select('id, name, phone_numbers, automation_paused')
    .eq('clinic_id', clinicId).contains('phone_numbers', [from]);
  if (labs?.[0]) {
    return processLabMessage({ clinicId, lab: labs[0], ...parsed, from });
  }

  const { data: patient } = await supabase.from('patients')
    .select('id, name, phone').eq('clinic_id', clinicId)
    .or(`phone.eq.${from},phone.eq.${from.replace('+91', '')}`)
    .limit(1).maybeSingle();
  if (patient) {
    return processPatientMessage({ clinicId, patient, body: parsed.body, messageId: parsed.messageId });
  }

  await notifyReceptionInbox(clinicId, {
    type: 'unknown_sender', from, body: (parsed.body || '').slice(0, 200), messageId: parsed.messageId,
  });
}

async function registerWhatsAppInboundWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handleInboundJob(job.data);
  });
  logger.info('[whatsapp-inbound.worker] registered');
}

module.exports = {
  registerWhatsAppInboundWorker, handleInboundJob, processLabMessage,
  normaliseBspPayload, QUEUE_NAME,
};
