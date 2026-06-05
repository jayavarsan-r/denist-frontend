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
const medicine = require('./parsers/medicine.parser');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const isDev = () => process.env.NODE_ENV !== 'production';

function noProvider() {
  return new AppError('AI_UNAVAILABLE', 'AI provider is not configured');
}

async function transcribeAudio(filePath, opts = {}) {
  if (sarvam.hasKey()) return sarvam.transcribe(filePath, opts);
  if (isDev()) { logger.warn('SARVAM_API_KEY missing — mock transcription (dev)'); return mock.transcribe(); }
  throw noProvider();
}

async function generateClinicalNote(transcript) {
  if (gemini.hasKey()) {
    return gemini.generate(consultationPrompt(), transcript, { temperature: 0.1, maxOutputTokens: 1024 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock clinical note (dev)'); return mock.clinicalNote(transcript); }
  throw noProvider();
}

async function extractPrescription(transcript) {
  let raw;
  if (gemini.hasKey()) {
    raw = await gemini.generate(prescriptionPrompt(), transcript, { temperature: 0.15, maxOutputTokens: 1500 });
  } else if (isDev()) {
    logger.warn('GEMINI_API_KEY missing — mock prescription (dev)');
    raw = mock.prescription();
  } else {
    throw noProvider();
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
  throw noProvider();
}

module.exports = {
  transcribeAudio,
  generateClinicalNote,
  extractPrescription,
  extractQueueContext,
};
