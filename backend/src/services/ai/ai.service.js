// AI orchestrator. Controllers call these methods — they never touch Sarvam or
// Gemini directly. Swapping Sarvam → Whisper later is a one-file change in providers/.
//
// Failure policy: when a real provider key is present and the call fails, the typed
// AI_* AppError propagates (frontend learns the truth). The mock provider is used
// ONLY in development when the key is absent (production fails fast at startup).

const sarvam = require('./providers/sarvam.provider');
const gemini = require('./providers/gemini.provider');
const mock = require('./providers/mock.provider');
const consultationPrompt = require('./prompts/consultation.prompt');
const prescriptionPrompt = require('./prompts/prescription.prompt');
const receptionistPrompt = require('./prompts/receptionist.prompt');
const schedulePrompt = require('./prompts/schedule.prompt');
const medicine = require('./parsers/medicine.parser');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const isDev = () => process.env.NODE_ENV !== 'production';

// Code-specific "not configured" errors so callers can tell WHICH provider is down:
// STT (Sarvam) vs LLM (Gemini). Both map to HTTP 503.
const noStt = () => new AppError('STT_UNAVAILABLE', 'Speech-to-text provider is not configured');
const noLlm = () => new AppError('LLM_UNAVAILABLE', 'LLM provider is not configured');

async function transcribeAudio(filePath, opts = {}) {
  if (sarvam.hasKey()) return sarvam.transcribe(filePath, opts);
  if (isDev()) { logger.warn('SARVAM_API_KEY missing — mock transcription (dev)'); return mock.transcribe(); }
  throw noStt();
}

// generateClinicalNote(transcript, current?) — when `current` (an existing structured
// note) is provided, the transcript is treated as a CORRECTION and merged on top:
// only the fields the doctor mentions change; everything else is preserved.
async function generateClinicalNote(transcript, current) {
  const userContent = current
    ? `CURRENT NOTE (JSON):\n${JSON.stringify(current)}\n\n` +
      `DOCTOR'S SPOKEN CORRECTION (apply on top of the current note):\n${transcript}\n\n` +
      `Return the FULL updated note in the exact same JSON schema. Change ONLY the fields the correction explicitly mentions; keep every other field EXACTLY as in CURRENT NOTE. Do not invent or reset unmentioned fields.`
    : transcript;
  if (gemini.hasKey()) {
    return gemini.generate(consultationPrompt(), userContent, { temperature: 0.1, maxOutputTokens: 1024 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock clinical note (dev)'); return mock.clinicalNote(transcript); }
  throw noLlm();
}

async function extractPrescription(transcript) {
  let raw;
  if (gemini.hasKey()) {
    // temperature 0: a prescription is a transcription task, not a creative one —
    // determinism here is what keeps Gemini from inventing a "typical" tablet.
    raw = await gemini.generate(prescriptionPrompt(), transcript, { temperature: 0, maxOutputTokens: 1500 });
  } else if (isDev()) {
    logger.warn('GEMINI_API_KEY missing — mock prescription (dev)');
    raw = mock.prescription();
  } else {
    throw noLlm();
  }
  // All medicine output flows through the single canonical parser.
  return {
    medicines: medicine.normalizeList(raw.medicines),
    instructions: raw.instructions || null,
    followUp: raw.followUp || null,
  };
}

// Merged receptionist extraction (old extract-complaint + extract-patient-info).
async function extractQueueContext(transcript) {
  if (gemini.hasKey()) {
    return gemini.generate(receptionistPrompt(), transcript, { temperature: 0.1, maxOutputTokens: 512 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock queue context (dev)'); return mock.queueContext(transcript); }
  throw noLlm();
}

// Scheduling INTENT only — never books or chooses slots (the deterministic engine does).
async function parseScheduleIntent(transcript) {
  if (gemini.hasKey()) {
    return gemini.generate(schedulePrompt(), transcript, { temperature: 0.1, maxOutputTokens: 400 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock schedule intent (dev)'); return mock.scheduleIntent ? mock.scheduleIntent(transcript) : {}; }
  throw noLlm();
}

module.exports = {
  transcribeAudio,
  generateClinicalNote,
  extractPrescription,
  extractQueueContext,
  parseScheduleIntent,
};
