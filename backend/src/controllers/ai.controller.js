const axios = require('axios');
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

// POST /api/ai/extract-patient — retains its own gender/arrays prompt pending full
// consolidation into the receptionist prompt. Uses header auth (no key in URL).
exports.extractPatient = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.startsWith('your_')) {
      return res.json({ patient: { name: null, age: null, gender: null, bloodGroup: null, conditions: [], allergies: [], medications: [] } });
    }

    const prompt = `You are a medical receptionist assistant at an Indian dental clinic. The receptionist has recorded patient details by voice — it may be in Tamil, English, or Tanglish.

Extract the following fields and return ONLY valid JSON:
{
  "name": "string or null — patient's full name if mentioned. Look for 'patient name is X', 'her name is X', 'his name is X', 'name X'. Return full name as stated.",
  "age": number or null,
  "gender": "Male" | "Female" | "Other" | null,
  "bloodGroup": "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-" | null,
  "conditions": ["Diabetes", "Hypertension", "Heart condition", "Pregnant", "Blood thinners"] — only include conditions that are clearly mentioned,
  "allergies": ["Penicillin", "Latex", ...] — list of allergies mentioned,
  "medications": ["Metformin", ...] — current medications mentioned
}

Rules:
- "sugar" or "sugar patient" or "diabetic" = Diabetes in conditions
- "BP" or "pressure" or "BP patient" = Hypertension in conditions
- "heart patient" or "cardiac" = Heart condition in conditions
- "pregnant" or "pregnancy" = Pregnant in conditions
- "blood thinner" or "warfarin" or "aspirin" = Blood thinners in conditions
- Return empty arrays if nothing mentioned, never null arrays
- Return ONLY the JSON object

Recording: ${transcript}`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 15000 });
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 15000 });

    let text = (response.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
    const patient = JSON.parse(text);
    res.json({ patient });
  } catch (e) {
    logger.warn('extractPatient failed', { err: e.message });
    res.json({ patient: { name: null, age: null, gender: null, bloodGroup: null, conditions: [], allergies: [], medications: [] } });
  }
};
