const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../utils/logger');
const { normalisePhone } = require('./whatsapp.adapter');

// Meta Cloud API provider — talks to Graph API directly, no BSP middleman (saves
// the AiSensy ₹999–4,000/mo platform fee). Selected via WHATSAPP_PROVIDER=meta.
//
// Module-shaped like the other providers in this directory: plain functions, no
// class. The orchestrator is the single call site for sendTemplate(); it passes a
// 5th `options` arg { phoneNumberId, language } so each clinic sends from its own
// WABA number (clinics.meta_phone_number_id). Falls back to META_PHONE_NUMBER_ID.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v18.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

const langCode = (lang) => (lang === 'ta' ? 'ta' : 'en');

// The orchestrator hands components as a flat array of strings (the template's
// body variables, in order). Quick-reply button payloads currently ride along as
// trailing body params — same contract the AiSensy provider uses; promoting them
// to a proper Meta `button` component is a follow-up once templates are finalised.
function buildComponents(params, mediaUrl) {
  const components = [];
  if (mediaUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: mediaUrl } }] });
  }
  if (params && params.length) {
    components.push({
      type: 'body',
      parameters: params.map((p) => ({ type: 'text', text: String(p == null ? '' : p) })),
    });
  }
  return components;
}

async function sendTemplate(to, templateName, components, mediaUrl = null, options = {}) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) return { success: false, messageId: null, error: 'META_WHATSAPP_TOKEN not configured' };

  const phoneId = options.phoneNumberId || process.env.META_PHONE_NUMBER_ID;
  if (!phoneId) {
    logger.error('[whatsapp:meta] no phone_number_id — set clinics.meta_phone_number_id or META_PHONE_NUMBER_ID');
    return { success: false, messageId: null, error: 'no_phone_number_id' };
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalisePhone(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: langCode(options.language) },
      components: buildComponents(components, mediaUrl),
    },
  };

  try {
    const res = await axios.post(`${BASE_URL}/${phoneId}/messages`, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return { success: true, messageId: res.data?.messages?.[0]?.id || `meta_${Date.now()}` };
  } catch (e) {
    const detail = e.response?.data?.error?.message
      || (e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : e.message);
    logger.error('[whatsapp:meta] sendTemplate failed', { to: normalisePhone(to), templateName, detail });
    return { success: false, messageId: null, error: detail };
  }
}

async function sendText(to, body, options = {}) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) return { success: false, messageId: null, error: 'META_WHATSAPP_TOKEN not configured' };

  const phoneId = options.phoneNumberId || process.env.META_PHONE_NUMBER_ID;
  if (!phoneId) return { success: false, messageId: null, error: 'no_phone_number_id' };

  // Free-form text only works inside an open 24h customer-service window.
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalisePhone(to),
    type: 'text',
    text: { body: String(body || '') },
  };

  try {
    const res = await axios.post(`${BASE_URL}/${phoneId}/messages`, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return { success: true, messageId: res.data?.messages?.[0]?.id || `meta_${Date.now()}` };
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    return { success: false, messageId: null, error: detail };
  }
}

// Meta signs webhooks: X-Hub-Signature-256: sha256=<hmac-hex>, keyed with the App
// Secret. The webhook route passes WHATSAPP_WEBHOOK_SECRET as `secret` — set that
// to your Meta App Secret when WHATSAPP_PROVIDER=meta.
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expected));
  } catch {
    return false; // length mismatch / bad encoding
  }
}

// Quick-reply button payloads are JSON-encoded; the inbound parser reads them back
// with JSON.parse (tier-1 deterministic match).
const encodeButtonPayload = (data) => JSON.stringify(data);

module.exports = { sendTemplate, sendText, verifySignature, encodeButtonPayload };
