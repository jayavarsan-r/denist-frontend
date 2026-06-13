const logger = require('../utils/logger');
const { getQueue } = require('../jobs/queue');
const { handleNotificationEvent } = require('../services/notification-orchestrator.service');

const QUEUE_NAME = 'whatsapp-outbound';

// Drains the orchestrator's event queue. All template-send failures throw, so
// pg-boss retries with the per-job retryLimit set at emit time.
async function registerWhatsAppOutboundWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { event, payload } = job.data;
      await handleNotificationEvent(event, payload);
    }
  });
  logger.info('[whatsapp-outbound.worker] registered');
}

module.exports = { registerWhatsAppOutboundWorker, QUEUE_NAME };
