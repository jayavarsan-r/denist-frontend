const fs = require('fs');
const multer = require('multer');
const supabase = require('../config/supabase');
const storageService = require('../services/storage.service');
const { getQueue, isQueueAvailable } = require('../jobs/queue');
const { QUEUE_NAME } = require('../workers/voice.worker');
const transaction = require('../services/transaction.service');

const UPLOAD_DIR = '/tmp/dental-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 25 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single('audio');

function cleanup(p) { try { if (p) fs.unlinkSync(p); } catch { /* ignore */ } }

// Shared intake: upload audio → create the draft row (status 'processing') → enqueue
// the voice job. The draft is created HERE, before the worker runs, so the client
// gets a draft_id immediately and subscribes to that row for the result.
async function startVoiceCore({ clinicId, patientId, queueEntryId, doctorId, dentistId, file }) {
  // Duplicate-submission guard (queue consults). If an in-flight draft already
  // exists for this queue entry (a double-tap of Stop, or a retry of start-voice),
  // return THAT draft instead of creating a second draft + second worker job. This
  // is the application-level half of "one consultation -> one draft -> one worker";
  // the partial unique index in migration 017 is the race-proof backstop.
  if (queueEntryId) {
    const { data: active } = await supabase.from('consultation_drafts')
      .select('id')
      .eq('clinic_id', clinicId).eq('queue_entry_id', queueEntryId)
      .in('status', ['processing', 'pending_review'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (active) {
      cleanup(file.path);
      return { draftId: active.id, jobId: null, deduped: true };
    }
  }

  // Give the temp file its real extension so the stored object (and the worker's
  // ffmpeg input) carry the actual container type.
  const ext = (file.mimetype || '').includes('mp4') ? '.mp4'
    : (file.mimetype || '').includes('ogg') ? '.ogg' : '.webm';
  const localPath = `${file.path}${ext}`;
  fs.renameSync(file.path, localPath);

  let audioPath;
  try {
    ({ storagePath: audioPath } = await storageService.uploadFile(
      localPath, 'voice-notes', `audio/${clinicId}/${queueEntryId || patientId}/${Date.now()}`,
    ));
  } finally {
    cleanup(localPath);
  }

  const { data: draft, error: draftErr } = await supabase.from('consultation_drafts')
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      queue_entry_id: queueEntryId || null,
      doctor_id: doctorId || null,
      audio_storage_path: audioPath,
      status: 'processing',
    })
    .select('id').single();
  if (draftErr) {
    // Race backstop: the migration-017 partial unique index rejected a concurrent
    // second draft for the same queue entry. Return the existing in-flight draft
    // rather than surfacing a 500 - the first request's worker is already running.
    if (draftErr.code === '23505' && queueEntryId) {
      const { data: active } = await supabase.from('consultation_drafts')
        .select('id').eq('clinic_id', clinicId).eq('queue_entry_id', queueEntryId)
        .in('status', ['processing', 'pending_review'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (active) return { draftId: active.id, jobId: null, deduped: true };
    }
    throw draftErr;
  }

  const jobId = await getQueue().send(QUEUE_NAME, {
    draftId: draft.id, clinicId, patientId, queueEntryId: queueEntryId || null,
    doctorId: doctorId || null, dentistId: dentistId || null, audioPath,
  }, { retryLimit: 2, retryDelay: 10 });

  return { draftId: draft.id, jobId };
}

// POST /api/queue/:id/start-voice — the queue consult entry point.
exports.startVoiceForQueue = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file received. Field name must be "audio".' });
    if (!req.clinicId) { cleanup(req.file.path); return res.status(403).json({ error: 'No clinic context' }); }
    if (!isQueueAvailable()) { cleanup(req.file.path); return res.status(503).json({ error: 'queue_unavailable', message: 'Voice processing is not configured (DATABASE_URL missing)' }); }

    const { data: entry } = await supabase.from('queue_entries')
      .select('id, patient_id, assigned_doctor, status')
      .eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!entry) { cleanup(req.file.path); return res.status(404).json({ error: 'queue_entry_not_found' }); }
    if (['ready_for_checkout', 'completed'].includes(entry.status)) {
      cleanup(req.file.path);
      return res.status(409).json({ error: 'invalid_queue_state', current: entry.status });
    }

    const { draftId, jobId } = await startVoiceCore({
      clinicId: req.clinicId,
      patientId: entry.patient_id,
      queueEntryId: entry.id,
      doctorId: entry.assigned_doctor || req.staffId || null,
      dentistId: req.dentistId || null,
      file: req.file,
    });

    // Queue board feedback (the entry's realtime channel carries this to every screen).
    await supabase.from('queue_entries')
      .update({ status: 'recording_processing', draft_id: draftId, updated_at: new Date().toISOString() })
      .eq('id', entry.id).eq('clinic_id', req.clinicId);

    res.status(202).json({ draft_id: draftId, job_id: jobId });
  } catch (e) { cleanup(req.file?.path); next(e); }
};

// POST /api/patients/:id/start-voice — the patient-profile consult (no queue entry).
exports.startVoiceForPatient = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file received. Field name must be "audio".' });
    if (!req.clinicId) { cleanup(req.file.path); return res.status(403).json({ error: 'No clinic context' }); }
    if (!isQueueAvailable()) { cleanup(req.file.path); return res.status(503).json({ error: 'queue_unavailable', message: 'Voice processing is not configured (DATABASE_URL missing)' }); }

    const { data: patient } = await supabase.from('patients')
      .select('id').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!patient) { cleanup(req.file.path); return res.status(404).json({ error: 'Patient not found' }); }

    const { draftId, jobId } = await startVoiceCore({
      clinicId: req.clinicId,
      patientId: patient.id,
      queueEntryId: null,
      doctorId: req.staffId || null,
      dentistId: req.dentistId || null,
      file: req.file,
    });

    res.status(202).json({ draft_id: draftId, job_id: jobId });
  } catch (e) { cleanup(req.file?.path); next(e); }
};

// POST /api/queue/:id/manual-draft — the "type your notes" path. Creates an EMPTY
// pending_review draft (no audio, no AI) so manual entry flows through the same
// confirm gate as voice. No raw_transcript → the confirm step skips correction
// logging, keeping the few-shot learning loop free of manual-entry noise.
exports.createManualDraft = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: entry } = await supabase.from('queue_entries')
      .select('id, patient_id, assigned_doctor')
      .eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!entry) return res.status(404).json({ error: 'queue_entry_not_found' });

    const { data: draft, error } = await supabase.from('consultation_drafts')
      .insert({
        clinic_id: req.clinicId,
        patient_id: entry.patient_id,
        queue_entry_id: entry.id,
        doctor_id: entry.assigned_doctor || req.staffId || null,
        status: 'pending_review',
      })
      .select('id').single();
    if (error) throw error;
    res.status(201).json({ draft_id: draft.id });
  } catch (e) { next(e); }
};

// GET /api/consultation-drafts/:id — Verification Card data (also the polling
// fallback when realtime is unavailable).
exports.getDraft = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: draft, error } = await supabase.from('consultation_drafts')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (error) throw error;
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json({ draft });
  } catch (e) { next(e); }
};

// PATCH /api/consultation-drafts/:id — the patient-profile consult confirm + reject.
// CONFIRM now runs the SAME orchestrator as the queue path (queueId=null), so the
// profile consult creates plan + visit + appointments + prescription identically —
// including availability-aware auto-scheduling. REJECT just sets the status.
exports.reviewDraft = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { status, confirmed_data: confirmedData } = req.body;

    const { data: draft } = await supabase.from('consultation_drafts')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (!['pending_review', 'error'].includes(draft.status)) {
      return res.status(409).json({ error: 'draft_already_processed', status: draft.status });
    }

    if (status === 'rejected') {
      const { data: updated, error } = await supabase.from('consultation_drafts')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', draft.id).eq('clinic_id', req.clinicId)
        .select('id, status').single();
      if (error) throw error;
      return res.json({ draft: updated });
    }

    // status === 'confirmed' → full clinical write via the shared orchestrator.
    const result = await transaction.confirmConsultationDraft({
      clinicId: req.clinicId, dentistId: req.dentistId, staffId: req.staffId, requestId: req.id,
      queueId: null, draft, confirmedData: confirmedData || {},
    });
    res.json(result);
  } catch (e) {
    if (e.message === 'draft_already_processed' || e.status === 409) {
      return res.status(409).json({ error: 'draft_already_processed' });
    }
    next(e);
  }
};
