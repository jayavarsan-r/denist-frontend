const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../utils/logger');
const { normalisePhone } = require('./whatsapp.adapter');

// AiSensy BSP provider. Requires AISENSY_API_KEY (+ approved template campaigns
// named `${AISENSY_CAMPAIGN_NAME_PREFIX}${templateName}`).
const BASE_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';

async function sendTemplate(to, templateName, components, mediaUrl = null) {
  const apiKey = process.env.AISENSY_API_KEY;
  if (!apiKey) return { success: false, messageId: null, error: 'AISENSY_API_KEY not configured' };

  const payload = {
    apiKey,
    campaignName: `${process.env.AISENSY_CAMPAIGN_NAME_PREFIX || 'dentai_'}${templateName}`,
    destination: normalisePhone(to),
    userName: 'DentAI',
    source: 'dentai-app',
    templateParams: (components || []).map((c) => String(c)),
    ...(mediaUrl ? { media: { url: mediaUrl, filename: 'attachment' } } : {}),
  };

  try {
    const res = await axios.post(BASE_URL, payload, { timeout: 15000 });
    return { success: true, messageId: res.data?.messageId || `aisensy_${Date.now()}` };
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
    logger.error('[whatsapp:aisensy] send failed', { to: payload.destination, templateName, detail });
    return { success: false, messageId: null, error: detail };
  }
}

async function sendText(to, body) {
  // AiSensy session-message API — endpoint depends on the account plan. Until it
  // is confirmed, fail honestly (templates cover every current flow).
  logger.warn('[whatsapp:aisensy] sendText not implemented — use a template');
  return { success: false, messageId: null, error: 'session_messages_not_implemented' };
}

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = crypto.createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const sig = String(signature).replace(/^sha256=/, '');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false; // length mismatch or bad encoding
  }
}

module.exports = { sendTemplate, sendText, verifySignature };
