const fs = require('fs');
const multer = require('multer');
const storageService = require('../services/storage.service');
const aiService = require('../services/ai/ai.service');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');

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
  try {
    logger.info('[transcribe] input', {
      sizeKb: Math.round((req.file.size || 0) / 1024),
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
    });
    try { fs.copyFileSync(req.file.path, '/tmp/last_audio_upload'); } catch {} // DIAG: inspect real browser audio
    const { transcript, raw } = await aiService.transcribeAudio(req.file.path, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });
    logger.info('[transcribe] output', {
      transcriptLen: (transcript || '').length,
      preview: (transcript || '').slice(0, 60),
      raw,
    });

    // Upload audio to Supabase Storage for dataset collection (non-fatal).
    let audioStoragePath = null;
    let audioFileSizeKb = null;
    try {
      const tempId = `tmp_${Date.now()}`;
      const uploaded = await storageService.uploadFile(
        req.file.path, 'voice-notes', `${recordingType}/${req.dentistId}/${tempId}`,
      );
      audioStoragePath = uploaded.storagePath;
      audioFileSizeKb = uploaded.sizeKb;
    } catch (uploadErr) {
      logger.warn('Audio upload failed (non-fatal)', { err: uploadErr.message });
    }

    if (audioStoragePath) {
      try {
        await supabase.from('voice_recordings').insert({
          dentist_id: req.dentistId,
          recording_type: recordingType,
          transcript: transcript || '',
          audio_path: audioStoragePath,
          audio_size_kb: audioFileSizeKb,
        });
      } catch (datasetErr) {
        logger.warn('voice_recordings insert failed (non-fatal)', { err: datasetErr.message });
      }
    }

    cleanup(req.file.path);
    res.json({ transcript, audioStoragePath, audioFileSizeKb });
  } catch (e) {
    cleanup(req.file.path);
    if (typeof e.code === 'string' && e.code.startsWith('AI_')) {
      return res.json({ transcript: '', warning: e.message });
    }
    next(e);
  }
};

// POST /api/ai/generate-note — Gemini structuring of a doctor's transcript.
exports.generateNote = async (req, res, next) => {
  try {
    const { transcript, current } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });
    // `current` (optional): an existing structured note → merge the transcript as a correction.
    const structured = await aiService.generateClinicalNote(transcript, current || null);
    res.json({ structured });
  } catch (e) { next(e); }
};

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
    logger.warn('extractPatient failed', { err: e.message });
    res.json({ patient: { name: null, age: null, gender: null, bloodGroup: null, conditions: [], allergies: [], medications: [] } });
  }
};