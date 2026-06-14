// AI orchestrator. Controllers call these methods — they never touch Sarvam or
// Gemini directly. Swapping Sarvam → Whisper later is a one-file change in providers/.
//
// PILOT RELIABILITY POLICY (no mock data, ever): there is no development fallback.
// When a provider key is missing or a call fails, the typed AI_* AppError propagates
// so the frontend — and the dentist — learn the truth. A failed AI run must never
// look like a successful one. Mock providers were deleted entirely; the only way
// these methods return data is a real provider answering successfully.

const sarvam = require('./providers/sarvam.provider');
const gemini = require('./providers/gemini.provider');
const prescriptionPrompt = require('./prompts/prescription.prompt');
const receptionistPrompt = require('./prompts/receptionist.prompt');
const schedulePrompt = require('./prompts/schedule.prompt');
const inventoryPrompt = require('./prompts/inventory.prompt');
const medicine = require('./parsers/medicine.parser');
const { AppError } = require('../../utils/errors');

// Code-specific "not configured" errors so callers can tell WHICH provider is down:
// STT (Sarvam) vs LLM (Gemini). Both map to HTTP 503.
const noStt = () => new AppError('STT_UNAVAILABLE', 'Speech-to-text provider is not configured');
const noLlm = () => new AppError('LLM_UNAVAILABLE', 'LLM provider is not configured');

async function transcribeAudio(filePath, opts = {}) {
  if (!sarvam.hasKey()) throw noStt();
  return sarvam.transcribe(filePath, opts);
}

// (generateClinicalNote was the old sync consult flow — deleted in Phase 2.
// The consult pipeline now lives in services/gemini-extraction.service.js,
// called from workers/voice.worker.js with injected clinic/patient context.)

async function extractPrescription(transcript) {
  if (!gemini.hasKey()) throw noLlm();
  // temperature 0: a prescription is a transcription task, not a creative one —
  // determinism here is what keeps Gemini from inventing a "typical" tablet.
  const raw = await gemini.generate(prescriptionPrompt(), transcript, { temperature: 0, maxOutputTokens: 1500 });
  // All medicine output flows through the single canonical parser.
  return {
    medicines: medicine.normalizeList(raw.medicines),
    instructions: raw.instructions || null,
    followUp: raw.followUp || null,
  };
}

// Merged receptionist extraction (old extract-complaint + extract-patient-info).
// temperature 0: extracting a patient's name/age/complaint from dictation is a
// transcription task, not a creative one. At 0.1 the same messy clip produced
// different outputs across runs (e.g. "Ramesh/Suresh" vs "Ramesh or Suresh") —
// 0 makes it deterministic.
async function extractQueueContext(transcript) {
  if (!gemini.hasKey()) throw noLlm();
  return gemini.generate(receptionistPrompt(), transcript, { temperature: 0, maxOutputTokens: 512 });
}

// Inventory voice extraction — classify + extract only (see inventory.prompt.js).
// temperature 0: this is transcription, not creativity.
async function extractInventory(transcript, catalog = []) {
  if (!gemini.hasKey()) throw noLlm();
  return gemini.generate(inventoryPrompt(catalog), transcript, { temperature: 0, maxOutputTokens: 800 });
}

// Scheduling INTENT only — never books or chooses slots (the deterministic engine does).
// temperature 0: parsing a date/time/procedure out of speech is extraction, not
// creativity — determinism keeps the same phrasing from yielding different intents.
async function parseScheduleIntent(transcript) {
  if (!gemini.hasKey()) throw noLlm();
  return gemini.generate(schedulePrompt(), transcript, { temperature: 0, maxOutputTokens: 400 });
}

module.exports = {
  transcribeAudio,
  extractPrescription,
  extractQueueContext,
  parseScheduleIntent,
  extractInventory,
};
