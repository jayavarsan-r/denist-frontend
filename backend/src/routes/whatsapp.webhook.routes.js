const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// BSP webhook receiver. MUST be mounted BEFORE express.json() in server.js —
// signature verification needs the raw body bytes.

// GET — Meta hub challenge verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('[webhook] WhatsApp webhook verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// POST — inbound events. ACK 200 IMMEDIATELY (BSPs retry/disable slow webhooks),
// then verify + enqueue; the inbound worker does all real processing.
router.post('/', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  res.sendStatus(200); // ack before ANY work

  try {
    if ((process.env.WHATSAPP_PROVIDER || 'stub') !== 'stub') {
      const { getWhatsAppProvider } = require('../providers/whatsapp');
      const signature = req.headers['x-hub-signature-256'] || req.headers['x-aisensy-signature'] || '';
      const ok = getWhatsAppProvider().verifySignature(req.body, signature, process.env.WHATSAPP_WEBHOOK_SECRET || '');
      if (!ok) {
        logger.warn('[webhook] signature verification failed — payload dropped');
        return;
      }
    }

    const payload = JSON.parse(req.body.toString());
    const { getQueue, isQueueAvailable } = require('../jobs/queue');
    if (!isQueueAvailable()) {
      logger.error('[webhook] job queue unavailable — inbound message LOST (set DATABASE_URL)');
      return;
    }
    await getQueue().send('whatsapp-inbound', { payload, receivedAt: new Date().toISOString() }, { retryLimit: 2, retryDelay: 30 });
  } catch (e) {
    logger.error('[webhook] failed to enqueue inbound payload', { err: e.message });
  }
});

module.exports = router;
