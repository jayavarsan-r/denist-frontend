const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { getQueue } = require('../jobs/queue');
const sarvam = require('../services/ai/providers/sarvam.provider');
const { buildConsultationContext } = require('../services/consultation-context.service');
const { extractFromTranscript } = require('../services/gemini-extraction.service');
const { runSafetyChecks } = require('../services/safety-net.service');
const { resolveMedicineSpan } = require('../services/inventory.service');

const QUEUE_NAME = 'voice-processing';

// The async voice pipeline. The start-voice route already created the draft row
// (status 'processing') and uploaded the audio; this worker fills the draft in:
//   download audio → Sarvam STT → context injection → Gemini extraction → Zod →
//   safety net → medicine resolution → draft pending_review → realtime notify.
// The frontend hears about it twice: on the draft row itself (Verification Card
// subscribes by draft id) and on the queue entry (queue board status).
async function handleVoiceJob(data) {
  const { draftId, clinicId, patientId, queueEntryId, doctorId, dentistId, audioPath } = data;

  // Re-entry safe: a pg-boss retry resets the draft to processing.
  await supabase.from('consultation_drafts')
    .update({ status: 'processing', error_code: null, error_detail: null, updated_at: new Date().toISOString() })
    .eq('id', draftId).eq('clinic_id', clinicId);

  let tmpFile = null;
  try {
    // 1. Download audio from Storage to a temp file (the Sarvam provider works on
    //    file paths — it transcodes/segments with ffmpeg).
    const { data: blob, error: dlErr } = await supabase.storage.from('voice-notes').download(audioPath);
    if (dlErr || !blob) {
      throw Object.assign(new Error(`audio download failed: ${dlErr?.message || 'no data'}`), { code: 'STT_UNAVAILABLE' });
    }
    const ext = path.extname(audioPath) || '.webm';
    tmpFile = path.join(os.tmpdir(), `voice-${draftId}${ext}`);
    fs.writeFileSync(tmpFile, Buffer.from(await blob.arrayBuffer()));

    // 2. Sarvam STT (throws typed STT_UNAVAILABLE / AI_TIMEOUT AppErrors)
    const { transcript } = await sarvam.transcribe(tmpFile, {
      originalname: path.basename(audioPath),
      mimetype: ext === '.mp4' ? 'audio/mp4' : 'audio/webm',
    });
    if (!transcript || !transcript.trim()) {
      throw Object.assign(new Error('empty transcript'), { code: 'STT_EMPTY' });
    }

    // Persist the transcript immediately — even if extraction fails the doctor
    // can read what was heard.
    await supabase.from('consultation_drafts')
      .update({ raw_transcript: transcript, updated_at: new Date().toISOString() })
      .eq('id', draftId);

    // Dataset capture (non-fatal; clinic_id column lands with migration 016)
    try {
      const row = { dentist_id: dentistId || null, recording_type: 'diagnosis', transcript, audio_path: audioPath };
      let { error } = await supabase.from('voice_recordings').insert({ ...row, clinic_id: clinicId });
      if (error) await supabase.from('voice_recordings').insert(row);
    } catch { /* non-fatal */ }

    // 3. Context injection (plain SQL, no vectors)
    const ctx = await buildConsultationContext(clinicId, patientId, doctorId);

    // 4. Gemini extraction + Zod (throws LLM_UNAVAILABLE / EXTRACTION_FAILED)
    const { data: extracted, lowConfidence, raw: geminiRaw } = await extractFromTranscript(transcript, ctx);

    // 5. Deterministic safety net
    const safetyFlags = runSafetyChecks(extracted, ctx);

    // 6. Resolve medicine spans against the clinic inventory: exact match →
    //    first-word prefix → strength disambiguation (inventory.service). The
    //    card shows price/stock for confident matches and amber otherwise.
    const prescriptions = await Promise.all(
      (extracted.prescriptions || []).map((rx) => resolveMedicineSpan(clinicId, rx))
    );

    // 7. Draft ready → Verification Card (realtime UPDATE on this row)
    await supabase.from('consultation_drafts')
      .update({
        gemini_raw: geminiRaw,
        extracted: { ...extracted, prescriptions },
        low_confidence: lowConfidence,
        safety_flags: safetyFlags,
        status: 'pending_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId).eq('clinic_id', clinicId);

    // 8. Queue board notification (queue consults only)
    if (queueEntryId) {
      await supabase.from('queue_entries')
        .update({ status: 'draft_ready', draft_id: draftId, updated_at: new Date().toISOString() })
        .eq('id', queueEntryId).eq('clinic_id', clinicId);
    }

    logger.info('[voice.worker] draft ready', { draftId, flags: safetyFlags.length });
  } catch (err) {
    const known = ['STT_UNAVAILABLE', 'LLM_UNAVAILABLE', 'EXTRACTION_FAILED', 'AI_TIMEOUT', 'STT_EMPTY', 'RATE_LIMITED'];
    const errorCode = known.includes(err.code) ? err.code : 'UNKNOWN_ERROR';

    await supabase.from('consultation_drafts')
      .update({
        status: 'error',
        error_code: errorCode,
        error_detail: (err.message || '').slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId).eq('clinic_id', clinicId);

    if (queueEntryId) {
      await supabase.from('queue_entries')
        .update({ status: 'voice_error', updated_at: new Date().toISOString() })
        .eq('id', queueEntryId).eq('clinic_id', clinicId);
    }

    logger.error('[voice.worker] job failed', { draftId, errorCode, err: err.message });
    throw err; // pg-boss retries (retryLimit set at send time)
  } finally {
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } }
  }
}

async function registerVoiceWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  // batchSize 1: jobs are independent and a batch failure would retry succeeded
  // jobs alongside the failed one (pg-boss v10 work() receives an ARRAY of jobs).
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handleVoiceJob(job.data);
  });
  logger.info('[voice.worker] registered');
}

module.exports = { registerVoiceWorker, handleVoiceJob, QUEUE_NAME };
