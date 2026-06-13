const { assertProvider } = require('./otp.adapter');
const stub = require('./stub.otp.provider');
const msg91 = require('./msg91.otp.provider');

const PROVIDERS = { stub, msg91 };

// OTP_PROVIDER env var selects the implementation (default: stub). Read at call time —
// not module load — so tests and config changes don't require a process restart.
// Going live with real SMS is one config change: OTP_PROVIDER=msg91 + MSG91_* keys.
function getOtpProvider() {
  const name = (process.env.OTP_PROVIDER || 'stub').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown OTP_PROVIDER '${name}' (expected: ${Object.keys(PROVIDERS).join(' | ')})`);
  return assertProvider(provider, name);
}

module.exports = { getOtpProvider };
