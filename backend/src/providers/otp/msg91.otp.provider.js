const axios = require('axios');
const logger = require('../../utils/logger');

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

// MSG91 OTP provider. Delivers OUR code (?otp= param) via the approved DLT template —
// MSG91's own OTP generation/verification is unused so the auth controller stays the
// single source of truth for codes. Requires MSG91_AUTH_KEY + MSG91_TEMPLATE_ID.
async function sendOtp(phone, code) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authKey || !templateId) {
    throw new Error('MSG91_AUTH_KEY / MSG91_TEMPLATE_ID not configured');
  }

  const response = await axios.post(MSG91_OTP_URL, null, {
    params: { template_id: templateId, mobile: `91${phone}`, otp: code },
    headers: { authkey: authKey },
    timeout: 10000,
  });

  const success = response.data?.type === 'success';
  if (!success) logger.warn('[otp:msg91] send rejected', { phone, response: response.data });
  return { success, messageId: response.data?.request_id || null };
}

module.exports = { sendOtp };
