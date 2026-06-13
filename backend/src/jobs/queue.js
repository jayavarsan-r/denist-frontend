const logger = require('../utils/logger');

// pg-boss job queue — runs on the SAME Supabase Postgres (its own `pgboss` schema,
// created automatically on first start). One queue instance per process.
//
// Requires DATABASE_URL (direct Postgres connection string — the Supabase client's
// REST URL cannot run pg-boss). When it is missing the server still boots, but
// isQueueAvailable() is false and voice endpoints answer 503 — a misconfigured
// worker must degrade loudly, not crash check-ins and payments with it.
//
// pg-boss v10 notes (this is NOT the v9 API): queues must be created before
// send/work, and work() handlers receive an ARRAY of jobs.

let boss = null;

async function startQueue() {
  if (boss) return boss;
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production (pg-boss job queue)');
    }
    logger.warn('[pg-boss] DATABASE_URL not set — job queue DISABLED (voice pipeline returns 503)');
    return null;
  }

  const PgBoss = require('pg-boss');
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: process.env.PGBOSS_SCHEMA || 'pgboss',
  });
  boss.on('error', (err) => logger.error('[pg-boss] error', { err: err.message }));
  await boss.start();
  logger.info('[pg-boss] queue started');
  return boss;
}

function getQueue() {
  if (!boss) throw new Error('Queue not started — call startQueue() first');
  return boss;
}

function isQueueAvailable() {
  return !!boss;
}

async function stopQueue() {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 10000 });
  boss = null;
  logger.info('[pg-boss] queue stopped');
}

module.exports = { startQueue, getQueue, isQueueAvailable, stopQueue };
