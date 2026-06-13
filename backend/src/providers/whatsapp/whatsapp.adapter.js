// WhatsApp BSP contract. Every provider in this directory implements:
//
//   sendTemplate(to, templateName, components, mediaUrl?) →
//       Promise<{ success, messageId, error? }>   — pre-approved template message
//   sendText(to, body) →
//       Promise<{ success, messageId, error? }>   — free-form, ONLY inside a 24h session
//   verifySignature(rawBody, signature, secret) → boolean
//
// Selection is config-only (WHATSAPP_PROVIDER in ./index.js). Providers never
// decide WHAT to send — that is the notification orchestrator's job, the single
// call site for sendTemplate in the entire codebase.

// '9876543210' / '919876543210' / '+91 98765 43210' → '+919876543210'
function normalisePhone(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

function assertProvider(p, name) {
  for (const method of ['sendTemplate', 'sendText', 'verifySignature']) {
    if (typeof p[method] !== 'function') {
      throw new Error(`WhatsApp provider '${name}' does not implement ${method}()`);
    }
  }
  return p;
}

module.exports = { normalisePhone, assertProvider };
