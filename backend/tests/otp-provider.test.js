// Phase 1d — OTP delivery is provider-gated by OTP_PROVIDER (stub | msg91).
const { getOtpProvider } = require('../src/providers/otp');
const stub = require('../src/providers/otp/stub.otp.provider');
const msg91 = require('../src/providers/otp/msg91.otp.provider');

describe('OTP provider selection', () => {
  const orig = process.env.OTP_PROVIDER;
  afterEach(() => {
    if (orig === undefined) delete process.env.OTP_PROVIDER;
    else process.env.OTP_PROVIDER = orig;
  });

  test('defaults to stub when OTP_PROVIDER is unset', () => {
    delete process.env.OTP_PROVIDER;
    expect(getOtpProvider()).toBe(stub);
  });

  test('OTP_PROVIDER=msg91 selects the MSG91 provider (case-insensitive)', () => {
    process.env.OTP_PROVIDER = 'MSG91';
    expect(getOtpProvider()).toBe(msg91);
  });

  test('unknown provider names fail loudly (config typo ≠ silent stub)', () => {
    process.env.OTP_PROVIDER = 'twillio';
    expect(() => getOtpProvider()).toThrow(/Unknown OTP_PROVIDER/);
  });

  test('stub delivers success + a messageId without sending anything', async () => {
    const out = await stub.sendOtp('9876543210', '123456');
    expect(out.success).toBe(true);
    expect(out.messageId).toMatch(/^stub_/);
  });

  test('msg91 refuses to run unconfigured (no fake success)', async () => {
    const k = process.env.MSG91_AUTH_KEY, t = process.env.MSG91_TEMPLATE_ID;
    delete process.env.MSG91_AUTH_KEY; delete process.env.MSG91_TEMPLATE_ID;
    await expect(msg91.sendOtp('9876543210', '123456')).rejects.toThrow(/not configured/);
    if (k !== undefined) process.env.MSG91_AUTH_KEY = k;
    if (t !== undefined) process.env.MSG91_TEMPLATE_ID = t;
  });
});
