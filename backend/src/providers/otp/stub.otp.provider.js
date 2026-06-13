const logger = require('../../utils/logger');

// Stub OTP provider — logs instead of sending (dev / pre-launch). The OTP itself is
// still generated and stored by the auth controller, so login works locally with
// USE_DEV_OTP or by reading the server log.
async function sendOtp(phone, code) {
  logger.info('[otp:stub] OTP send (not delivered)', { phone, code });
  return { success: true, messageId: `stub_${Date.now()}` };
}

module.exports = { sendOtp };
