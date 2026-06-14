const axios = require('axios');
const { AppError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

// Model is pinned here (single source of truth). NOTE: the deployment .env comment
// historically said "gemini-1.5-flash"; the model actually used is below — keep this
// constant authoritative and the env comment in sync.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Collect every configured Gemini key, in priority order:
//   GEMINI_API_KEYS   — comma-separated list (preferred for many keys)
//   GEMINI_API_KEY_1 … GEMINI_API_KEY_12  — numbered keys (underscore)
//   GEMINI_API_KEY1  … GEMINI_API_KEY12   — numbered keys (no underscore — common typo)
//   GEMINI_API_KEY    — the legacy single key
// De-duplicated, placeholders ("your_…") dropped. Read live each call so a key added
// to the environment is picked up without a redeploy.
//
// NOTE: both `GEMINI_API_KEY_1` and `GEMINI_API_KEY1` are accepted on purpose — a
// mismatch here disables Gemini entirely (callers then throw LLM_UNAVAILABLE — there
// is no mock fallback), so we recognise the obvious naming variant rather than fail
// closed on a typo.
function getKeys() {
  const raw = [];
  if (process.env.GEMINI_API_KEYS) raw.push(...process.env.GEMINI_API_KEYS.split(','));
  for (let i = 1; i <= 12; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`] || process.env[`GEMINI_API_KEY${i}`];
    if (k) raw.push(k);
  }
  if (process.env.GEMINI_API_KEY) raw.push(process.env.GEMINI_API_KEY);
  return [...new Set(raw.map((k) => (k || '').trim()).filter((k) => k && !k.startsWith('your_')))];
}

function hasKey() {
  return getKeys().length > 0;
}

// Round-robin cursor so load spreads across keys on EVERY request (not only after a
// failure) — this is what keeps any single free-tier key under its per-minute cap.
let cursor = 0;

function parseResponse(res) {
  let text = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new AppError('EXTRACTION_FAILED', 'Empty response from AI');
  // JSON mode (responseMimeType) makes this clean, but stay defensive: strip any
  // ```json fences the model still emits…
  text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    // …and as a last resort pull out the first balanced { … } block, in case prose
    // got prepended/appended. A parse failure means ZERO fields fill on the screen,
    // so it's worth this extra recovery rather than throwing.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    // 422: the provider answered but the output is unusable. Carry the raw text so
    // callers/logs can see what the model actually said.
    throw new AppError('EXTRACTION_FAILED', 'AI returned unparseable output', { raw: text.slice(0, 2000) });
  }
}

// generate(systemPrompt, userContent, opts) → parsed JSON object.
//
// KEY ROTATION: within one call we try each configured key once, starting at the
// round-robin point. A key that is rate-limited (429), quota-exhausted (403) or hits
// an overloaded model (503) is skipped immediately for the NEXT key — that's the whole
// point of rotation. If EVERY key is transiently busy in a pass, we back off (honouring
// Gemini's RetryInfo when present) and try the keys again, up to `maxRetries` passes.
// Timeouts and parse errors are terminal (rotating wouldn't help and would multiply
// latency). Never returns silent fake data — failures throw typed AppErrors.
async function generate(systemPrompt, userContent, opts = {}) {
  const keys = getKeys();
  if (!keys.length) throw new AppError('LLM_UNAVAILABLE', 'AI provider is not configured');

  const body = {
    contents: [{ parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      // Force structured output. This is the single biggest reliability win for field
      // extraction — Gemini returns a raw JSON object with no markdown fences and no
      // prose, so JSON.parse no longer fails intermittently across the different forms.
      responseMimeType: 'application/json',
    },
  };
  // responseSchema (a Gemini OpenAPI-subset schema, NOT JSON Schema/Zod) pins the
  // OUTPUT STRUCTURE — field names, nesting, enums, types — not just "valid JSON".
  // This is what stops shape drift on messy dictation with flash-lite. Optional:
  // callers without a schema keep the JSON-mode-only behaviour.
  if (opts.responseSchema) body.generationConfig.responseSchema = opts.responseSchema;
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

  const maxRetries = opts.maxRetries ?? 2;
  const start = cursor % keys.length;
  cursor = (cursor + 1) % keys.length; // advance for the next request regardless of outcome

  // Optional telemetry collector for structured logging — populated in place so the
  // return type (the parsed object) is unchanged for every existing caller.
  const tel = opts.telemetry && typeof opts.telemetry === 'object' ? opts.telemetry : null;
  const startedAt = Date.now();
  if (tel) { tel.model = MODEL; tel.keyCount = keys.length; }

  for (let pass = 0; ; pass++) {
    let retryDelayMs = 0; // largest Gemini-suggested delay seen this pass
    for (let i = 0; i < keys.length; i++) {
      const idx = (start + i) % keys.length;
      try {
        const response = await axios.post(GEMINI_URL, body, {
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[idx] },
          timeout: opts.timeout ?? 30000,
        });
        if (tel) { tel.keyIndexUsed = idx + 1; tel.processingTimeMs = Date.now() - startedAt; tel.passes = pass + 1; }
        return parseResponse(response);
      } catch (e) {
        if (e instanceof AppError) throw e; // parse/empty → terminal
        if (e.code === 'ECONNABORTED') throw new AppError('AI_TIMEOUT', 'AI request timed out');
        const status = e.response?.status;
        const rotatable = status === 429 || status === 403 || status === 503;
        if (rotatable) {
          const details = e.response?.data?.error?.details || [];
          const ri = details.find((d) => (d['@type'] || '').includes('RetryInfo'));
          const suggested = ri?.retryDelay ? parseFloat(ri.retryDelay) * 1000 : 0;
          retryDelayMs = Math.max(retryDelayMs, suggested);
          if (keys.length > 1) logger.warn(`[gemini] key #${idx + 1} busy (${status}) — rotating`);
          continue; // try the next key
        }
        throw new AppError('LLM_UNAVAILABLE', `AI provider error (${status || 'network'})`);
      }
    }
    // Every key was transiently busy this pass.
    if (pass >= maxRetries) {
      throw new AppError('RATE_LIMITED', 'AI is busy (all keys rate-limited) — try again in a moment');
    }
    const delay = Math.min(retryDelayMs || (1000 * 2 ** pass), 8000);
    await new Promise((r) => setTimeout(r, delay));
  }
}

module.exports = { generate, hasKey, getKeys, GEMINI_URL, MODEL };