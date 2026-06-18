require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const requestId = require('./middleware/requestId');
const { validateEnv } = require('./config/env');
const { responseEnvelope } = require('./utils/response');

// Startup configuration safety: refuse to boot when misconfigured (missing keys /
// binaries, or dev mode against a shared clinic DB) rather than run degraded. All
// the checks live in config/env.js; this throws before listen().
validateEnv();

const app = express();

app.use(requestId); // must be first — attaches req.requestId to all subsequent middleware
app.use(helmet());
// gzip every response. JSON payloads (patient lists, case sheets with nested
// visits/notes/prescriptions) compress 5–10× — a real win on mobile connections,
// at negligible CPU for our payload sizes.
app.use(compression());
// Allow all origins — Capacitor APK makes requests from capacitor://localhost
// and the Authorization header handles security (not CORS)
app.use(cors({ origin: true }));
// 'dev' logging is colourful but noisy/verbose for a deployed box; use the standard
// Apache 'combined' format in production, 'dev' locally. Overridable via LOG_FORMAT.
app.use(morgan(process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'combined' : 'dev')));
// BSP webhook mounts BEFORE express.json(): signature verification needs the
// raw body bytes (the route uses express.raw internally).
app.use('/api/webhooks/whatsapp', require('./routes/whatsapp.webhook.routes'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Standardize every JSON response into { success, data } / { success, error }.
app.use(responseEnvelope);
// Rate limit. A single screen render fans out to many endpoints (auth/me, queue,
// patients, appointments, analytics, clinic…) plus polling, so 100/15min throttles
// even normal use. Default is generous and overridable via RATE_LIMIT_MAX; dev is
// effectively unlimited so local polling never trips it.
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 1000 : 100000),
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/patients', require('./routes/patients.routes'));
app.use('/api/visits', require('./routes/visits.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/treatment-plans', require('./routes/treatment-plans.routes'));
app.use('/api/visits/:visitId/notes', require('./routes/visit-notes.routes'));
app.use('/api/prescriptions', require('./routes/prescriptions.routes'));
app.use('/api/xrays', require('./routes/xrays.routes'));
app.use('/api/lab-orders', require('./routes/lab-orders.routes'));
app.use('/api/dataset', require('./routes/dataset.routes'));
app.use('/api/queue', require('./routes/queue.routes'));
app.use('/api/staff', require('./routes/staff.routes'));
app.use('/api/clinic', require('./routes/clinic.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/payment-plans', require('./routes/payment-plans.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/consultation-drafts', require('./routes/consultation-drafts.routes'));
app.use('/api/inventory', require('./routes/inventory.routes'));
app.use('/api/lab-cases', require('./routes/lab-cases.routes'));
app.use('/api/labs', require('./routes/labs.routes'));
app.use('/api/reception', require('./routes/reception-inbox.routes'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use(require('./middleware/errorHandler'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`DentAI Backend running on port ${PORT}`);
  const { runAudioCleanup } = require('./jobs/cleanup.job');
  setTimeout(() => runAudioCleanup(18).catch(console.error), 30000);
  setInterval(() => runAudioCleanup(18).catch(console.error), 24 * 60 * 60 * 1000);

  // pg-boss job queue + workers. startQueue() is a no-op (with a loud warning)
  // when DATABASE_URL is missing in dev — voice endpoints then answer 503 while
  // everything else keeps working.
  try {
    const { startQueue } = require('./jobs/queue');
    const boss = await startQueue();
    if (boss) {
      await require('./workers/voice.worker').registerVoiceWorker();
      await require('./workers/whatsapp-outbound.worker').registerWhatsAppOutboundWorker();
      await require('./workers/whatsapp-inbound.worker').registerWhatsAppInboundWorker();
      await require('./workers/lab-timeouts.worker').registerLabTimeoutsWorker();
      await require('./workers/reminders.worker').registerRemindersWorker();
      await require('./workers/eod.worker').registerEodWorker();
    }
  } catch (e) {
    console.error('[pg-boss] failed to start:', e.message);
    // Don't exit — let the server stay up and serve non-queue routes.
    // Voice/WhatsApp endpoints will return 503 until DATABASE_URL is set.
  }
});

// Graceful shutdown: stop taking jobs, finish in-flight ones, then exit.
async function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  try { await require('./jobs/queue').stopQueue(); } catch { /* already stopped */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 12000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
