const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { AppError } = require('../../../utils/errors');

const SARVAM_URL = 'https://api.sarvam.ai/speech-to-text';

function hasKey() {
  const k = process.env.SARVAM_API_KEY;
  return !!k && k !== 'your_sarvam_api_key_here';
}

// transcribe(filePath, { originalname, mimetype }) → { transcript, raw }
// Sarvam accepts wav/mp3/ogg/flac/m4a — NOT webm. Chrome's webm/opus is labelled
// as ogg (same codec) so Sarvam accepts the container.
async function transcribe(filePath, opts = {}) {
  const origName = opts.originalname || '';
  const mimeType = opts.mimetype || 'audio/ogg';

  let ext = 'ogg';
  if (origName.endsWith('.m4a') || origName.endsWith('.mp4') || mimeType.includes('mp4') || mimeType.includes('mpeg')) ext = 'm4a';
  else if (origName.endsWith('.wav') || mimeType.includes('wav')) ext = 'wav';
  else if (origName.endsWith('.mp3') || mimeType.includes('mp3')) ext = 'mp3';
  else if (origName.endsWith('.flac') || mimeType.includes('flac')) ext = 'flac';

  const filename = `recording.${ext}`;
  const contentType = ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : `audio/${ext}`;

  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), { filename, contentType });
  formData.append('model', 'saarika:v2.5');
  formData.append('language_code', 'en-IN'); // en-IN handles Tamil + English mixing reliably
  formData.append('with_timestamps', 'false');

  let response;
  try {
    response = await axios.post(SARVAM_URL, formData, {
      headers: { ...formData.getHeaders(), 'api-subscription-key': process.env.SARVAM_API_KEY },
      timeout: opts.timeout ?? 30000,
    });
  } catch (e) {
    if (e.code === 'ECONNABORTED') throw new AppError('AI_TIMEOUT', 'Transcription timed out');
    const data = e.response?.data;
    const msg = data?.error?.message || data?.message || data?.detail || e.message;
    throw new AppError('AI_UNAVAILABLE', `Sarvam error (${e.response?.status || 'network'}): ${msg}`);
  }
  return { transcript: response.data.transcript || '', raw: response.data };
}

module.exports = { transcribe, hasKey, SARVAM_URL };
