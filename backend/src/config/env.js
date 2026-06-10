const logger = require('../utils/logger');

// Fail fast in production if critical configuration is missing, so we never
// silently boot with mock AI or a bad Supabase/JWT setup. In development we
// only warn (mock providers are allowed there).
const ALWAYS_REQUIRED = ['SUPABASE_URL', 'JWT_SECRET'];
const PROD_REQUIRED = ['GEMINI_API_KEY', 'SARVAM_API_KEY'];

function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];

  for (const k of ALWAYS_REQUIRED) {
    if (!process.env[k]) missing.push(k);
  }
  if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_ANON_KEY) {
    missing.push('SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)');
  }
  if (isProd) {
    for (const k of PROD_REQUIRED) {
      const v = process.env[k];
      if (!v || v.startsWith('your_')) missing.push(k);
    }
  }

  if (missing.length) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (isProd) throw new Error(msg);
    logger.warn(`${msg} (development — continuing with mock fallbacks where applicable)`);
  }
}

module.exports = { validateEnv };
