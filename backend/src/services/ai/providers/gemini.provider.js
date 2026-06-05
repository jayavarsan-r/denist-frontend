const axios = require('axios');
const { AppError } = require('../../../utils/errors');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

function hasKey() {
  const k = process.env.GEMINI_API_KEY;
  return !!k && !k.startsWith('your_');
}

// generate(systemPrompt, userContent, opts) → parsed JSON object.
// Throws typed AppErrors (AI_TIMEOUT / AI_UNAVAILABLE / AI_PARSE_ERROR) on failure
// — never returns silent fake data. The API key travels in the header, not the URL.
async function generate(systemPrompt, userContent, opts = {}) {
  const body = {
    contents: [{ parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.15,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

  let response;
  try {
    response = await axios.post(GEMINI_URL, body, {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      timeout: opts.timeout ?? 30000,
    });
  } catch (e) {
    if (e.code === 'ECONNABORTED') throw new AppError('AI_TIMEOUT', 'AI request timed out');
    throw new AppError('AI_UNAVAILABLE', `AI provider error (${e.response?.status || 'network'})`);
  }

  let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new AppError('AI_PARSE_ERROR', 'Empty response from AI');
  text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('AI_PARSE_ERROR', 'AI returned unparseable output');
  }
}

module.exports = { generate, hasKey, GEMINI_URL };
