// OTP provider contract. Every provider in this directory implements:
//
//   sendOtp(phone, code) → Promise<{ success: boolean, messageId: string|null }>
//
//   phone — 10-digit Indian mobile number (no country code)
//   code  — the numeric OTP to deliver
//
// Providers NEVER generate or store the code — the auth controller owns that.
// They only deliver it. A delivery failure must resolve { success: false } or
// throw; it must never fake success.
//
// Selection is config-only: set OTP_PROVIDER in .env (see ./index.js). Adding a
// new provider = new file implementing sendOtp + one case in index.js.

function assertProvider(p, name) {
  if (typeof p.sendOtp !== 'function') {
    throw new Error(`OTP provider '${name}' does not implement sendOtp(phone, code)`);
  }
  return p;
}

module.exports = { assertProvider };
