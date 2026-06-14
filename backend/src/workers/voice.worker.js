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
//
// OBSERVABILITY: every stage emits a structured event (stt.completed,
// gemini.completed, validation.completed, safety.completed, pipeline.completed /
// pipeline.failed) carrying the common correlation fields below, so a failed run is
// never invisible and a successful run is always traceable end-to-end by draftId.
async function handleVoiceJob(data, job) {
  const { draftId, clinicId, patientId, queueEntryId, doctorId, dentistId, audioPath } = data;

  // Correlation context on EVERY log line. attemptNumber distinguishes a fresh run
  // from a pg-boss retry (key for idempotency + cost diagnosis).
  const attemptNumber = (job && (job.retryCount ?? job.retrycount)) != null
    ? (job.retryCount ?? job.retrycount) + 1 : 1;
  const base = {
    requestId: data.requestId || null,
    jobId: job?.id || null,
    draftId,
    clinicId,
    queueEntryId: queueEntryId || null,
    attemptNumber,
  };
  const log = (event, fields = {}) => logger.info(event, { ...base, event, timestamp: new Date().toISOString(), ...fields });
  const logErr = (event, fields = {}) => logger.error(event, { ...base, event, timestamp: new Date().toISOString(), ...fields });

  // currentStage powers pipeline.failed so we always know WHERE it broke.
  let currentStage = 'init';
  log('pipeline.started', { patientId });

  // Re-entry safe: a pg-boss retry resets the draft to processing.
  await supabase.from('consultation_drafts')
    .update({ status: 'processing', error_code: null, error_detail: null, updated_at: new Date().toISOString() })
    .eq('id', draftId).eq('clinic_id', clinicId);

  let tmpFile = null;
  try {
    // 1. Download audio from Storage to a temp file (the Sarvam provider works on
    //    file paths - it transcodes/segments with ffmpeg).
    currentStage = 'download';
    const { data: blob, error: dlErr } = await supabase.storage.from('voice-notes').download(audioPath);
    if (dlErr || !blob) {
      throw Object.assign(new Error(`audio download failed: ${dlErr?.message || 'no data'}`), { code: 'STT_UNAVAILABLE' });
    }
    const ext = path.extname(audioPath) || '.webm';
    tmpFile = path.join(os.tmpdir(), `voice-${draftId}${ext}`);
    fs.writeFileSync(tmpFile, Buffer.from(await blob.arrayBuffer()));

    // 2. Sarvam STT (throws typed STT_UNAVAILABLE / AI_TIMEOUT AppErrors)
    currentStage = 'stt';
    const { transcript, raw: sttRaw = {} } = await sarvam.transcribe(tmpFile, {
      originalname: path.basename(audioPath),
      mimetype: ext === '.mp4' ? 'audio/mp4' : 'audio/webm',
    });
    log('stt.completed', {
      processingTimeMs: sttRaw.processingTimeMs ?? null,
      probeMs: sttRaw.probeMs ?? null,
      sttCallMs: sttRaw.sttCallMs ?? null,
      audioSize: sttRaw.audioSize ?? null,
      duration: sttRaw.duration ?? null,
      transcoded: sttRaw.transcoded ?? null,
      segmented: sttRaw.segmented ?? null,
      chunkCount: sttRaw.chunkCount ?? null,
      emptyChunkCount: sttRaw.emptyChunkCount ?? 0,
      transcriptLength: (transcript || '').length,
    });
    if (!transcript || !transcript.trim()) {
      throw Object.assign(new Error('empty transcript'), { code: 'STT_EMPTY' });
    }

    // Persist the transcript immediately - even if extraction fails the doctor
    // can read what was heard.
    await supabase.from('consultation_drafts')
      .update({ raw_transcript: transcript, updated_at: new Date().toISOString() })
      .eq('id', draftId);

    // Dataset capture (non-fatal). IDEMPOTENT across pg-boss retries: keyed on the
    // draft's audio_path so a retry never inserts a duplicate dataset row.
    try {
      const { data: existing } = await supabase.from('voice_recordings')
        .select('id').eq('audio_path', audioPath).limit(1).maybeSingle();
      if (!existing) {
        const row = { dentist_id: dentistId || null, recording_type: 'diagnosis', transcript, audio_path: audioPath };
        let { error } = await supabase.from('voice_recordings').insert({ ...row, clinic_id: clinicId });
        if (error) await supabase.from('voice_recordings').insert(row);
      }
    } catch { /* non-fatal */ }

    // 3. Context injection (plain SQL, no vectors)
    currentStage = 'context';
    const ctx = await buildConsultationContext(clinicId, patientId, doctorId);

    // 4. Gemini extraction + Zod (throws LLM_UNAVAILABLE / EXTRACTION_FAILED)
    currentStage = 'gemini';
    const { data: extracted, lowConfidence, droppedCount, salvageUsed, raw: geminiRaw, telemetry = {} } =
      await extractFromTranscript(transcript, ctx);
    log('gemini.completed', {
      processingTimeMs: telemetry.processingTimeMs ?? null,
      model: telemetry.model ?? null,
      keyIndexUsed: telemetry.keyIndexUsed ?? null,
      salvageUsed: !!salvageUsed,
      droppedFieldCount: droppedCount,
      lowConfidenceCount: lowConfidence.length,
    });

    // validation.completed - what Zod rejected (surfaced, never hidden).
    currentStage = 'validation';
    log('validation.completed', {
      failedFields: lowConfidence,
      lowConfidenceItems: lowConfidence.length,
      droppedItems: droppedCount,
    });

    // 5. Deterministic safety net (+ VISIBLE flags for silently-degraded data so the
    //    doctor SEES that something could not be read rather than getting fewer rows).
    currentStage = 'safety';
    const safetyFlags = runSafetyChecks(extracted, ctx);
    if (droppedCount > 0) {
      safetyFlags.push({
        type: 'extraction_dropped_items', severity: 'medium', field: 'general',
        message: `${droppedCount} item${droppedCount > 1 ? 's' : ''} could not be confidently understood and ${droppedCount > 1 ? 'were' : 'was'} left out - re-record or add manually.`,
      });
    }
    if ((sttRaw.emptyChunkCount ?? 0) > 0) {
      safetyFlags.push({
        type: 'transcript_partial', severity: 'medium', field: 'general',
        message: `Part of the recording (${sttRaw.emptyChunkCount} segment${sttRaw.emptyChunkCount > 1 ? 's' : ''}) could not be transcribed - review the notes for gaps.`,
      });
    }
    log('safety.completed', { warningCount: safetyFlags.length, warningTypes: safetyFlags.map((f) => f.type) });

    // 6. Resolve medicine spans against the clinic inventory: exact match ->
    //    first-word prefix -> strength disambiguation (inventory.service). The
    //    card shows price/stock for confident matches and amber otherwise.
    currentStage = 'medicine_resolve';
    const prescriptions = await Promise.all(
      (extracted.prescriptions || []).map((rx) => resolveMedicineSpan(clinicId, rx))
    );

    // 7. Draft ready -> Verification Card (realtime UPDATE on this row). Guarded on
    //    status STILL 'processing': if the doctor already acted, or a duplicate
    //    worker run raced us, we never clobber a pending_review/confirmed draft.
    currentStage = 'persist';
    const { data: persisted } = await supabase.from('consultation_drafts')
      .update({
        gemini_raw: geminiRaw,
        extracted: { ...extracted, prescriptions },
        low_confidence: lowConfidence,
        safety_flags: safetyFlags,
        status: 'pending_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId).eq('clinic_id', clinicId).eq('status', 'processing')
      .select('id').maybeSingle();
    if (!persisted) {
      log('pipeline.skipped', { reason: 'draft_no_longer_processing' });
      return;
    }

    // 8. Queue board notification (queue consults only)
    if (queueEntryId) {
      await supabase.from('queue_entries')
        .update({ status: 'draft_ready', draft_id: draftId, updated_at: new Date().toISOString() })
        .eq('id', queueEntryId).eq('clinic_id', clinicId);
    }

    log('pipeline.completed', { flags: safetyFlags.length, droppedFieldCount: droppedCount });
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

    logErr('pipeline.failed', {
      stage: currentStage,
      errorCode,
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 4).join(' | '),
    });
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
    for (const job of jobs) await handleVoiceJob(job.data, job);
  });
  logger.info('[voice.worker] registered');
}

module.exports = { registerVoiceWorker, handleVoiceJob, QUEUE_NAME };
