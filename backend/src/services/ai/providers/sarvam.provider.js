const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { AppError } = require('../../../utils/errors');

const SARVAM_URL = 'https://api.sarvam.ai/speech-to-text';

// Sarvam's real-time endpoint rejects audio longer than 30s. Anything above the
// limit is split into smaller chunks and transcribed piece-by-piece, then joined.
const MAX_SECONDS = 29;      // single-shot ceiling (margin under Sarvam's 30s)
const CHUNK_SECONDS = 25;    // per-chunk length when segmenting long audio

function hasKey() {
  const k = process.env.SARVAM_API_KEY;
  return !!k && k !== 'your_sarvam_api_key_here';
}

// Probe audio duration in seconds via ffprobe. Returns null if unavailable
// (e.g. ffprobe not installed) so the caller falls back to a single-shot call.
async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ]);
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

// Split audio into <=chunkSec WAV segments (16kHz mono — STT-friendly, and a
// reliable container Sarvam accepts). Returns { dir, files } for cleanup.
async function splitAudio(filePath, chunkSec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarvam-'));
  const pattern = path.join(dir, 'chunk_%03d.wav');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-vn', '-ar', '16000', '-ac', '1',
    '-f', 'segment', '-segment_time', String(chunkSec),
    '-y', pattern,
  ]);
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.wav'))
    .sort()
    .map((f) => path.join(dir, f));
  return { dir, files };
}

// One real-time transcription call to Sarvam. Returns the transcript string.
async function callSarvam(filePath, filename, contentType) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), { filename, contentType });
  formData.append('model', 'saarika:v2.5');
  formData.append('language_code', 'en-IN'); // en-IN handles Tamil + English mixing reliably
  formData.append('with_timestamps', 'false');

  let response;
  try {
    response = await axios.post(SARVAM_URL, formData, {
      headers: { ...formData.getHeaders(), 'api-subscription-key': process.env.SARVAM_API_KEY },
      timeout: 60000,
    });
  } catch (e) {
    if (e.code === 'ECONNABORTED') throw new AppError('AI_TIMEOUT', 'Transcription timed out');
    const data = e.response?.data;
    const msg = data?.error?.message || data?.message || data?.detail || e.message;
    throw new AppError('AI_UNAVAILABLE', `Sarvam error (${e.response?.status || 'network'}): ${msg}`);
  }
  return response.data.transcript || '';
}

// Transcode any input to a clean 16kHz mono WAV. Browsers record webm/opus, which
// Sarvam does NOT decode reliably (it silently returns an empty transcript), so we
// normalise to WAV — a container Sarvam handles consistently — before sending.
async function toWav(filePath) {
  const out = path.join(os.tmpdir(), `sarvam-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-vn', '-ar', '16000', '-ac', '1', '-y', out,
  ]);
  return out;
}

// Best-guess filename/content-type when transcoding is unavailable (ffmpeg missing).
function guessType(opts) {
  const origName = opts.originalname || '';
  const mimeType = opts.mimetype || 'audio/ogg';
  let ext = 'ogg';
  if (origName.endsWith('.m4a') || origName.endsWith('.mp4') || mimeType.includes('mp4') || mimeType.includes('mpeg')) ext = 'm4a';
  else if (origName.endsWith('.wav') || mimeType.includes('wav')) ext = 'wav';
  else if (origName.endsWith('.mp3') || mimeType.includes('mp3')) ext = 'mp3';
  else if (origName.endsWith('.flac') || mimeType.includes('flac')) ext = 'flac';
  const contentType = ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : `audio/${ext}`;
  return { filename: `recording.${ext}`, contentType };
}

// transcribe(filePath, { originalname, mimetype }) → { transcript, raw }
async function transcribe(filePath, opts = {}) {
  const duration = await probeDuration(filePath);

  // Short clip (or duration unknown) → transcode to WAV then a single real-time call.
  // If ffmpeg/transcode fails, fall back to sending the original with a guessed type.
  if (!duration || duration <= MAX_SECONDS) {
    let wav = null;
    try {
      wav = await toWav(filePath);
      const transcript = await callSarvam(wav, 'recording.wav', 'audio/wav');
      return { transcript, raw: { duration, transcoded: true } };
    } catch (e) {
      const { filename, contentType } = guessType(opts);
      const transcript = await callSarvam(filePath, filename, contentType);
      return { transcript, raw: { duration, transcoded: false } };
    } finally {
      if (wav) { try { fs.unlinkSync(wav); } catch {} }
    }
  }

  // Long clip → segment into WAV chunks, transcribe sequentially, join.
  let split;
  try {
    split = await splitAudio(filePath, CHUNK_SECONDS);
  } catch (e) {
    throw new AppError('AI_UNAVAILABLE',
      `Recording is longer than 30s and could not be segmented (${e.message}). Ensure ffmpeg is installed.`);
  }
  try {
    const parts = [];
    for (const chunk of split.files) {
      const t = await callSarvam(chunk, path.basename(chunk), 'audio/wav');
      if (t && t.trim()) parts.push(t.trim());
    }
    const transcript = parts.join(' ').replace(/\s+/g, ' ').trim();
    return { transcript, raw: { duration, chunks: split.files.length } };
  } finally {
    try { fs.rmSync(split.dir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { transcribe, hasKey, SARVAM_URL };
