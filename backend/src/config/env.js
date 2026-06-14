const logger = require('../utils/logger');
const { execFileSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// Startup configuration safety (PILOT READINESS).
//
// The server must fail LOUDLY and refuse to boot when it is misconfigured, rather
// than start in a degraded state that produces hidden behaviour in front of a
// dentist. There are no mock AI fallbacks anywhere in the codebase, so a missing
// provider key now means a real, visible error at runtime — but we'd rather catch
// it at boot.
//
// Two checks fail the process; the rest only fail in production:
//   1. NODE_ENV !== 'production' while pointing at a SHARED (remote) clinic DB.
//      A clinic deployment ALWAYS talks to remote Supabase; running it in dev mode
//      is exactly the footgun that wrote mock/dev-shaped data into real clinics.
//      A developer who knowingly wants dev mode against the shared DB must set
//      ALLOW_DEV_AGAINST_REMOTE_DB=true to opt in — clinic hosts never set that.
//   2. Required env / binaries missing.
// ─────────────────────────────────────────────────────────────────────────────

const ALWAYS_REQUIRED = ['SUPABASE_URL', 'JWT_SECRET'];
const AI_REQUIRED = ['SARVAM_API_KEY']; // Gemini handled below (many key-name variants)

function isPlaceholder(v) {
  return !v || String(v).startsWith('your_');
}

// Mirrors gemini.provider.getKeys(): a Gemini key under ANY accepted name counts.
function hasGeminiKey() {
  if (process.env.GEMINI_API_KEYS && process.env.GEMINI_API_KEYS.split(',').some((k) => !isPlaceholder(k.trim()))) return true;
  for (let i = 1; i <= 12; i++) {
    if (!isPlaceholder(process.env[`GEMINI_API_KEY_${i}`]) || !isPlaceholder(process.env[`GEMINI_API_KEY${i}`])) return true;
  }
  return !isPlaceholder(process.env.GEMINI_API_KEY);
}

// A "shared / remote clinic DB" = anything that is not an explicitly local host.
// Local Supabase / Postgres runs on localhost or 127.0.0.1; Supabase Cloud is
// *.supabase.co / *.supabase.in. We treat "not local" as "remote".
function pointsAtRemoteDb() {
  const urls = [process.env.SUPABASE_URL, process.env.DATABASE_URL].filter(Boolean);
  return urls.some((u) => {
    let host;
    try { host = new URL(u).hostname; } catch { host = String(u); }
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
      || host.endsWith('.local') || host.startsWith('192.168.') || host.startsWith('10.');
    return !local;
  });
}

// Required external binaries. The Sarvam STT path transcodes/segments audio with
// ffmpeg and probes duration with ffprobe; their absence silently changes the STT
// code path (no transcode, no segmentation), so verify them at boot.
const REQUIRED_BINARIES = ['ffmpeg', 'ffprobe'];

function checkBinaries() {
  const missing = [];
  for (const bin of REQUIRED_BINARIES) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
    } catch {
      missing.push(bin);
    }
  }
  return missing;
}

function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const fatal = [];   // always abort
  const warnings = [];

  // 1. Dev-mode-against-shared-DB guard (the highest-priority pilot safety check).
  if (!isProd && pointsAtRemoteDb() && process.env.ALLOW_DEV_AGAINST_REMOTE_DB !== 'true') {
    fatal.push(
      `NODE_ENV is "${process.env.NODE_ENV || 'undefined'}" but SUPABASE_URL/DATABASE_URL point at a REMOTE (shared) database. ` +
      'Clinic deployments must run with NODE_ENV=production. ' +
      'If you are a developer intentionally testing against the shared DB, set ALLOW_DEV_AGAINST_REMOTE_DB=true.'
    );
  }

  // 2. Always-required config.
  for (const k of ALWAYS_REQUIRED) {
    if (!process.env[k]) fatal.push(`Missing required environment variable: ${k}`);
  }
  if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_ANON_KEY) {
    fatal.push('Missing required environment variable: SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)');
  }

  // 3. AI provider keys. Required in production (no mock fallback exists); a warning
  //    in dev so a developer without keys still boots, but knows AI calls will 503.
  const aiMissing = [];
  for (const k of AI_REQUIRED) if (isPlaceholder(process.env[k])) aiMissing.push(k);
  if (!hasGeminiKey()) aiMissing.push('GEMINI_API_KEY (or GEMINI_API_KEYS / GEMINI_API_KEY_1…12)');
  if (aiMissing.length) {
    const msg = `Missing AI provider key(s): ${aiMissing.join(', ')} — AI endpoints will return 503 (no mock fallback)`;
    if (isProd) fatal.push(msg); else warnings.push(msg);
  }

  // 4. Required binaries. Fatal in production (STT correctness depends on them);
  //    a warning in dev.
  const binMissing = checkBinaries();
  if (binMissing.length) {
    const msg = `Missing required binaries on PATH: ${binMissing.join(', ')} — voice transcription will degrade or fail`;
    if (isProd) fatal.push(msg); else warnings.push(msg);
  }

  // Report.
  for (const w of warnings) logger.warn(`[startup] ${w}`);
  if (fatal.length) {
    const msg = 'Startup configuration check failed:\n  - ' + fatal.join('\n  - ');
    // Throw so server.js aborts before listen().
    throw new Error(msg);
  }
  logger.info('[startup] configuration check passed', {
    nodeEnv: process.env.NODE_ENV || 'undefined',
    remoteDb: pointsAtRemoteDb(),
  });
}

module.exports = { validateEnv, hasGeminiKey, pointsAtRemoteDb, checkBinaries };
