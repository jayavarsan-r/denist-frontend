// AI orchestrator. Controllers call these methods — they never touch Sarvam or
// Gemini directly. Swapping Sarvam → Whisper later is a one-file change in providers/.
//
// Failure policy: when a real provider key is present and the call fails, the typed
// AI_* AppError propagates (frontend learns the truth). The mock provider is used
// ONLY in development when the key is absent (production fails fast at startup).

const sarvam = require('./providers/sarvam.provider');
const gemini = require('./providers/gemini.provider');
const mock = require('./providers/mock.provider');
const prescriptionPrompt = require('./prompts/prescription.prompt');
const receptionistPrompt = require('./prompts/receptionist.prompt');
const schedulePrompt = require('./prompts/schedule.prompt');
const inventoryPrompt = require('./prompts/inventory.prompt');
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

// (generateClinicalNote was the old sync consult flow — deleted in Phase 2.
// The consult pipeline now lives in services/gemini-extraction.service.js,
// called from workers/voice.worker.js with injected clinic/patient context.)

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

// Inventory voice extraction — classify + extract only (see inventory.prompt.js).
// temperature 0: this is transcription, not creativity.
async function extractInventory(transcript, catalog = []) {
  if (gemini.hasKey()) {
    return gemini.generate(inventoryPrompt(catalog), transcript, { temperature: 0, maxOutputTokens: 800 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock inventory extraction (dev)'); return mock.inventory(transcript); }
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
  extractPrescription,
  extractQueueContext,
  parseScheduleIntent,
  extractInventory,
};
