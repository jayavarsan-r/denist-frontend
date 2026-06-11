const axios = require('axios');
const { AppError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

// Collect every configured Gemini key, in priority order:
//   GEMINI_API_KEYS   — comma-separated list (preferred for many keys)
//   GEMINI_API_KEY_1 … GEMINI_API_KEY_12  — numbered keys
//   GEMINI_API_KEY    — the legacy single key
// De-duplicated, placeholders ("your_…") dropped. Read live each call so a key added
// to the environment is picked up without a redeploy.
function getKeys() {
  const raw = [];
  if (process.env.GEMINI_API_KEYS) raw.push(...process.env.GEMINI_API_KEYS.split(','));
  for (let i = 1; i <= 12; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
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
  if (!text) throw new AppError('AI_PARSE_ERROR', 'Empty response from AI');
  text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('AI_PARSE_ERROR', 'AI returned unparseable output');
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
  if (!keys.length) throw new AppError('AI_UNAVAILABLE', 'AI provider is not configured');

  const body = {
    contents: [{ parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.15,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

  const maxRetries = opts.maxRetries ?? 2;
  const start = cursor % keys.length;
  cursor = (cursor + 1) % keys.length; // advance for the next request regardless of outcome

  for (let pass = 0; ; pass++) {
    let retryDelayMs = 0; // largest Gemini-suggested delay seen this pass
    for (let i = 0; i < keys.length; i++) {
      const idx = (start + i) % keys.length;
      try {
        const response = await axios.post(GEMINI_URL, body, {
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[idx] },
          timeout: opts.timeout ?? 30000,
        });
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
        throw new AppError('AI_UNAVAILABLE', `AI provider error (${status || 'network'})`);
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

module.exports = { generate, hasKey, getKeys, GEMINI_URL };
