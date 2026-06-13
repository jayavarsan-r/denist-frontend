const logger = require('../../utils/logger');

// Stub provider — logs instead of sending. The default until a BSP account is
// live; the whole engine (queues, orchestrator, logging) runs against it.
const fakeId = () => `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function sendTemplate(to, templateName, components, mediaUrl = null) {
  const messageId = fakeId();
  logger.info('[whatsapp:stub] sendTemplate', { to, templateName, messageId, media: mediaUrl || undefined });
  return { success: true, messageId };
}

async function sendText(to, body) {
  const messageId = fakeId();
  logger.info('[whatsapp:stub] sendText', { to, preview: String(body || '').slice(0, 80), messageId });
  return { success: true, messageId };
}

function verifySignature() {
  return true; // stub always trusts (webhook route also skips verification on stub)
}

module.exports = { sendTemplate, sendText, verifySignature };
