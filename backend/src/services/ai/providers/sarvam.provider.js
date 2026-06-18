const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { AppError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

const SARVAM_URL = 'https://api.sarvam.ai/speech-to-text';

// Sarvam's real-time endpoint rejects audio longer than 30s. Anything above the
// limit is split into smaller chunks and transcribed piece-by-piece, then joined.
const MAX_SECONDS = 29;      // single-shot ceiling (margin under Sarvam's 30s)
const CHUNK_SECONDS = 25;    // per-chunk length when segmenting long audio

// Bounded retry policy. We retry ONLY transient failures (network/timeout/5xx);
// a 4xx (bad request, invalid audio, auth) is deterministic — retrying it just
// wastes time and money — so it fails immediately. Delays between attempts:
const RETRY_DELAYS_MS = [2000, 5000, 10000]; // attempt 1 → 2s → 3 → 5s → 4 → 10s → fail
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Classify an axios error: { retryable, code, status }. ECONNABORTED is a timeout;
// any 5xx or a network error (no response) is transient; a 401/403 is auth; any
// other 4xx is a bad request / invalid audio.
function classify(e) {
  if (e.code === 'ECONNABORTED') return { retryable: true, code: 'AI_TIMEOUT', status: null };
  const status = e.response?.status;
  if (status == null) return { retryable: true, code: 'STT_UNAVAILABLE', status: null }; // network
  if (status >= 500) return { retryable: true, code: 'STT_UNAVAILABLE', status };
  if (status === 401 || status === 403) return { retryable: false, code: 'STT_UNAVAILABLE', status };
  return { retryable: false, code: 'STT_UNAVAILABLE', status }; // 4xx bad request / invalid audio
}

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
// Retries ONLY transient failures (network / timeout / 5xx) with a bounded
// backoff (2s, 5s, 10s); a 4xx (bad request, invalid audio, auth) fails at once.
async function callSarvam(filePath, filename, contentType) {
  const maxAttempts = RETRY_DELAYS_MS.length + 1; // 4 attempts total
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), { filename, contentType });
      formData.append('model', 'saarika:v2.5');
      // 'unknown' = Sarvam auto language-detection. We previously pinned 'en-IN', but
      // that ran regional speech (Tamil/Hindi/Telugu) through an English decoder, which
      // phonetically MANGLES Indian patient names before Gemini ever sees them — the
      // "name not captured correctly" symptom. saarika:v2.5 auto-detects per-utterance,
      // and the spoken word IS the value, so a name said in any supported language now
      // transcribes faithfully. Configurable via SARVAM_LANGUAGE_CODE for deployments
      // that want to force a single language (default: auto-detect).
      formData.append('language_code', process.env.SARVAM_LANGUAGE_CODE || 'unknown');
      formData.append('with_timestamps', 'false');

      const response = await axios.post(SARVAM_URL, formData, {
        headers: { ...formData.getHeaders(), 'api-subscription-key': process.env.SARVAM_API_KEY },
        timeout: 60000,
      });
      // saarika:v2.5 returns the auto-detected language + confidence; surface them so
      // prod logs show what patients actually speak (and confirm this fix is helping).
      if (response.data.language_code) {
        logger.info('[sarvam] detected language', {
          language: response.data.language_code,
          probability: response.data.language_probability ?? null,
        });
      }
      return response.data.transcript || '';
    } catch (e) {
      lastErr = e;
      const { retryable, code, status } = classify(e);
      const data = e.response?.data;
      const detail = data?.error?.message || data?.message || data?.detail || e.message;

      if (retryable && attempt < maxAttempts) {
        const delay = RETRY_DELAYS_MS[attempt - 1];
        logger.warn('[sarvam] transient failure — retrying', {
          attempt, nextAttempt: attempt + 1, delayMs: delay, status: status || 'network', code, detail: String(detail).slice(0, 200),
        });
        await sleep(delay);
        continue;
      }
      // Terminal: either non-retryable (4xx/auth) or out of attempts.
      logger.error('[sarvam] call failed', { attempt, retryable, status: status || 'network', code, detail: String(detail).slice(0, 200) });
      throw new AppError(code, `Sarvam error (${status || 'network'}): ${detail}`);
    }
  }
  // Unreachable, but keep the contract explicit.
  throw new AppError('STT_UNAVAILABLE', `Sarvam error: ${lastErr?.message || 'unknown'}`);
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

// Single real-time call: transcode to WAV (Sarvam doesn't decode webm/opus
// reliably) then send. If transcode fails, send the original with a guessed type.
async function singleShot(filePath, opts, duration) {
  let wav = null;
  try {
    wav = await toWav(filePath);
    const sttStart = Date.now();
    const transcript = await callSarvam(wav, 'recording.wav', 'audio/wav');
    return { transcript, raw: { duration, transcoded: true, segmented: false, chunkCount: 1, emptyChunkCount: transcript && transcript.trim() ? 0 : 1, sttCallMs: Date.now() - sttStart } };
  } catch (e) {
    if (e instanceof AppError) throw e; // a real Sarvam failure (after retries) must surface, not be hidden by a fallback path
    const { filename, contentType } = guessType(opts);
    const sttStart = Date.now();
    const transcript = await callSarvam(filePath, filename, contentType);
    return { transcript, raw: { duration, transcoded: false, segmented: false, chunkCount: 1, emptyChunkCount: transcript && transcript.trim() ? 0 : 1, sttCallMs: Date.now() - sttStart } };
  } finally {
    if (wav) { try { fs.unlinkSync(wav); } catch {} }
  }
}

// Segment into <=CHUNK_SECONDS WAV chunks, transcribe them IN PARALLEL, then join
// in original order. Sequential transcription was the dominant cost on long notes
// (~959 ms/chunk × N back-to-back, e.g. 4.8s for a 107s note); the chunks are
// independent network calls, so Promise.all collapses that to roughly one chunk's
// latency. Promise.all preserves array order, so the join stays correctly ordered.
//
// emptyChunkCount surfaces SILENT GAPS: a chunk that came back empty means part of
// the consult was lost. We no longer drop that quietly — the count is returned so
// the worker can log it and the pipeline can flag a partial transcript. A real
// Sarvam failure on ANY chunk rejects the whole batch (the typed AppError
// propagates) rather than silently yielding a partial transcript.
async function segmentAndJoin(filePath, duration) {
  const split = await splitAudio(filePath, CHUNK_SECONDS);
  try {
    const sttStart = Date.now();
    const results = await Promise.all(
      split.files.map((chunk) => callSarvam(chunk, path.basename(chunk), 'audio/wav'))
    );
    const sttCallMs = Date.now() - sttStart; // wall-clock for the PARALLEL batch (~one chunk, not the sum)
    let emptyChunkCount = 0;
    const parts = [];
    for (const t of results) {
      if (t && t.trim()) parts.push(t.trim());
      else emptyChunkCount++;
    }
    const transcript = parts.join(' ').replace(/\s+/g, ' ').trim();
    return { transcript, raw: { duration, transcoded: true, segmented: true, chunkCount: split.files.length, emptyChunkCount, sttCallMs } };
  } finally {
    try { fs.rmSync(split.dir, { recursive: true, force: true }); } catch {}
  }
}

// transcribe(filePath, { originalname, mimetype }) → { transcript, raw }
// raw carries STT-stage telemetry for structured logging:
//   { duration, transcoded, segmented, chunkCount, emptyChunkCount,
//     processingTimeMs, audioSize, durationProbed }
async function transcribe(filePath, opts = {}) {
  const startedAt = Date.now();
  let audioSize = null;
  try { audioSize = fs.statSync(filePath).size; } catch {}
  const probeStart = Date.now();
  const duration = await probeDuration(filePath);
  const probeMs = Date.now() - probeStart;

  // processingTimeMs = whole STT stage; probeMs = ffprobe; sttCallMs = time spent in
  // Sarvam network calls (transcode/segment time ≈ processingTimeMs − probeMs −
  // sttCallMs). These per-step numbers make the latency budget measurable in prod.
  const withMeta = (out) => ({
    ...out,
    raw: { ...out.raw, processingTimeMs: Date.now() - startedAt, probeMs, audioSize, durationProbed: duration != null },
  });

  // Only audio we can PROVE is short skips segmentation. Browser MediaRecorder
  // webm/opus blobs carry no duration metadata, so probeDuration returns null —
  // and a long such recording would otherwise hit Sarvam's 30s limit as a single
  // shot. Treat unknown duration as "might be long" and segment it (a short clip
  // simply yields one chunk). Fall back to a single shot only if SEGMENTING ITSELF
  // fails (e.g. ffmpeg unavailable) — never to mask a real Sarvam error, which
  // propagates from callSarvam as a typed AppError.
  if (duration != null && duration <= MAX_SECONDS) {
    return withMeta(await singleShot(filePath, opts, duration));
  }

  try {
    return withMeta(await segmentAndJoin(filePath, duration));
  } catch (e) {
    if (e instanceof AppError) throw e; // Sarvam failed on a chunk — surface it, don't retry whole as single-shot
    return withMeta(await singleShot(filePath, opts, duration)); // segmentation infra (ffmpeg) failed
  }
}

module.exports = { transcribe, hasKey, SARVAM_URL };
