const fs = require('fs');
const multer = require('multer');
const storageService = require('../services/storage.service');
const aiService = require('../services/ai/ai.service');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');
const inventoryVoice = require('../services/inventory-voice.service');
const audit = require('../services/audit.service');

// Ensure upload directory exists
const UPLOAD_DIR = '/tmp/dental-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});
exports.uploadMiddleware = upload.single('audio');

function cleanup(p) { try { if (p) fs.unlinkSync(p); } catch { /* ignore */ } }

// POST /api/ai/transcribe — Sarvam STT. Soft-fails (returns a `warning`) so the UI
// prompts a re-record rather than hard-erroring the screen.
exports.transcribe = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received. Make sure field name is "audio".' });
  }
  const recordingType = req.body?.recordingType || 'general';
  const startedAt = Date.now();
  try {
    logger.info('[transcribe] input', {
      sizeKb: Math.round((req.file.size || 0) / 1024),
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
    });
    const { transcript, raw } = await aiService.transcribeAudio(req.file.path, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });
    logger.info('[transcribe] output', {
      transcriptLen: (transcript || '').length,
      preview: (transcript || '').slice(0, 60),
      sttMs: raw?.processingTimeMs ?? null,
      totalMs: Date.now() - startedAt,
    });

    // Respond NOW — the dentist's result is ready. The Supabase upload + dataset
    // insert below are pure dataset collection: they don't affect the transcript,
    // and awaiting them added ~1.1–1.3s of dead wait to every call. They run after
    // the response, and the temp file is cleaned up when that background work ends.
    res.json({ transcript });

    persistRecordingDataset({
      filePath: req.file.path, recordingType, dentistId: req.dentistId, transcript,
    }).catch(() => { /* fully non-fatal — already logged inside */ })
      .finally(() => cleanup(req.file.path));
  } catch (e) {
    cleanup(req.file.path);
    // No 200-with-warning soft-fail: STT failures surface as real HTTP errors
    // (503 STT_UNAVAILABLE / 504 AI_TIMEOUT) so callers can detect and retry.
    next(e);
  }
};

// Off-the-critical-path dataset collection: upload the audio to Storage and record
// the (audio, transcript) pair for future fine-tuning. Best-effort; never throws.
async function persistRecordingDataset({ filePath, recordingType, dentistId, transcript }) {
  let audioStoragePath = null;
  let audioFileSizeKb = null;
  try {
    const tempId = `tmp_${Date.now()}`;
    const uploaded = await storageService.uploadFile(
      filePath, 'voice-notes', `${recordingType}/${dentistId}/${tempId}`,
    );
    audioStoragePath = uploaded.storagePath;
    audioFileSizeKb = uploaded.sizeKb;
  } catch (uploadErr) {
    logger.warn('Audio upload failed (non-fatal)', { err: uploadErr.message });
  }

  if (audioStoragePath) {
    try {
      await supabase.from('voice_recordings').insert({
        dentist_id: dentistId,
        recording_type: recordingType,
        transcript: transcript || '',
        audio_path: audioStoragePath,
        audio_size_kb: audioFileSizeKb,
      });
    } catch (datasetErr) {
      logger.warn('voice_recordings insert failed (non-fatal)', { err: datasetErr.message });
    }
  }
}

// POST /api/ai/parse-schedule — natural language → structured scheduling intent ONLY.
// No booking, no availability, no slot choice (the deterministic engine handles those).
exports.parseSchedule = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    res.json({ intent: await aiService.parseScheduleIntent(transcript) });
  } catch (e) { next(e); }
};

// POST /api/ai/extract-prescription — Gemini → canonical medicine schema.
exports.extractPrescription = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    res.json(await aiService.extractPrescription(transcript));
  } catch (e) { next(e); }
};

// POST /api/ai/extract-inventory — voice → inventory INTENT only (never writes).
// Requires clinic context; resolution is clinic-scoped. The raw transcript is
// recorded in the audit log (debugging) — it is never returned for display.
exports.extractInventory = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    const result = await inventoryVoice.parseInventoryCommand(req.clinicId, transcript);
    audit.log({
      clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'VOICE_INVENTORY_PARSE', entityType: 'inventory_voice', entityId: null,
      metadata: { transcript: String(transcript).slice(0, 500), intent: result.intent },
    });
    res.json(result);
  } catch (e) { next(e); }
};

// POST /api/ai/extract-queue-context — merged receptionist extraction (NEW canonical).
exports.extractQueueContext = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    res.json(await aiService.extractQueueContext(transcript));
  } catch (e) { next(e); }
};

// POST /api/ai/extract-patient-info — deprecated alias of extract-queue-context.
exports.extractPatientInfo = exports.extractQueueContext;

// POST /api/ai/extract-complaint — deprecated; returns just the chief complaint.
exports.extractComplaint = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    const ctx = await aiService.extractQueueContext(transcript);
    res.json({ complaint: ctx.chiefComplaint || transcript });
  } catch (e) { next(e); }
};

// POST /api/ai/extract-patient — patient registration extraction. Now routed through
// the SAME provider + receptionist prompt as every other extraction (it used to be a
// divergent inline Gemini call on a single env key, which silently returned an all-null
// patient whenever that one key was missing/misnamed/rate-limited). The receptionist
// prompt returns medical `flags`; we reshape them into the legacy
// { patient: { name, age, gender, bloodGroup, conditions[], allergies[], medications[] } }
// envelope so any existing caller stays compatible.
exports.extractPatient = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const ctx = await aiService.extractQueueContext(transcript);
    const f = ctx.flags || {};
    const conditions = [];
    if (f.hasDiabetes) conditions.push('Diabetes');
    if (f.hasHypertension) conditions.push('Hypertension');
    if (f.hasHeartCondition) conditions.push('Heart condition');
    if (f.isPregnant) conditions.push('Pregnant');
    if (f.isOnBloodThinners) conditions.push('Blood thinners');
    const allergies = [];
    if (f.penicillin) allergies.push('Penicillin');
    if (f.latex) allergies.push('Latex');

    res.json({
      patient: {
        name: ctx.name ?? null,
        age: ctx.age ?? null,
        gender: null, // not extracted by the receptionist prompt
        bloodGroup: ctx.bloodGroup ?? null,
        conditions,
        allergies,
        medications: [],
      },
    });
  } catch (e) {
    // No silent all-null 200: extraction failures surface as real HTTP errors
    // (422 EXTRACTION_FAILED / 503 LLM_UNAVAILABLE) so the client can fall back
    // to manual entry knowing the AI did NOT run.
    logger.warn('extractPatient failed', { err: e.message });
    next(e);
  }
};