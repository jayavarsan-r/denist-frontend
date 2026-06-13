// Phase 5 Part A — Meta Cloud API WhatsApp provider. Pure unit test: axios is
// mocked so no network. Covers the guard paths (no token / no phone id), the
// Graph API request shape, error surfacing, the per-clinic→env phone fallback,
// HMAC signature verification, and provider selection via WHATSAPP_PROVIDER=meta.

const crypto = require('crypto');

jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const meta = require('../../src/providers/whatsapp/meta-cloud.provider');

const OLD_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV };
});
afterAll(() => { process.env = OLD_ENV; });

describe('Meta Cloud provider — sendTemplate', () => {
  test('fails clearly (no network call) when the token is missing', async () => {
    delete process.env.META_WHATSAPP_TOKEN;
    const r = await meta.sendTemplate('9876543210', 'tpl', ['x']);
    expect(r).toEqual({ success: false, messageId: null, error: 'META_WHATSAPP_TOKEN not configured' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('fails with no_phone_number_id when neither per-clinic nor env id is set', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok';
    delete process.env.META_PHONE_NUMBER_ID;
    const r = await meta.sendTemplate('9876543210', 'tpl', ['x']);
    expect(r.success).toBe(false);
    expect(r.error).toBe('no_phone_number_id');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('posts a correctly shaped Graph API template request', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok123';
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.ABC' }] } });

    const r = await meta.sendTemplate(
      '9876543210', 'dentai_lab_new_en', ['Sunrise Clinic', 'SR-0042'],
      'https://files/impression.jpg', { phoneNumberId: 'PHONE_1', language: 'ta' },
    );

    expect(r).toEqual({ success: true, messageId: 'wamid.ABC' });
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v18.0/PHONE_1/messages');
    expect(config.headers.Authorization).toBe('Bearer tok123');
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+919876543210'); // normalisePhone applied
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('dentai_lab_new_en');
    expect(body.template.language.code).toBe('ta');

    const header = body.template.components.find((c) => c.type === 'header');
    expect(header.parameters[0].image.link).toBe('https://files/impression.jpg');
    const bodyComp = body.template.components.find((c) => c.type === 'body');
    expect(bodyComp.parameters).toEqual([
      { type: 'text', text: 'Sunrise Clinic' },
      { type: 'text', text: 'SR-0042' },
    ]);
  });

  test('defaults language to en and omits the header when no media', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok';
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } });
    await meta.sendTemplate('9876543210', 'tpl', ['only'], null, { phoneNumberId: 'P' });
    const body = axios.post.mock.calls[0][1];
    expect(body.template.language.code).toBe('en');
    expect(body.template.components.some((c) => c.type === 'header')).toBe(false);
  });

  test('falls back to META_PHONE_NUMBER_ID when no per-clinic id is passed', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok';
    process.env.META_PHONE_NUMBER_ID = 'PHONE_ENV';
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } });
    await meta.sendTemplate('9876543210', 'tpl', ['x'], null, {});
    expect(axios.post.mock.calls[0][0]).toContain('/PHONE_ENV/messages');
  });

  test('surfaces the Graph API error message on failure', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok';
    process.env.META_PHONE_NUMBER_ID = 'PHONE_ENV';
    axios.post.mockRejectedValue({ response: { data: { error: { message: 'Invalid OAuth access token' } } } });
    const r = await meta.sendTemplate('9876543210', 'tpl', ['x']);
    expect(r.success).toBe(false);
    expect(r.error).toBe('Invalid OAuth access token');
  });
});

describe('Meta Cloud provider — verifySignature', () => {
  test('accepts a valid HMAC and rejects tampered / missing ones', () => {
    const secret = 'app_secret';
    const raw = Buffer.from(JSON.stringify({ entry: [{ id: '1' }] }));
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    expect(meta.verifySignature(raw, sig, secret)).toBe(true);
    expect(meta.verifySignature(raw, 'sha256=deadbeef', secret)).toBe(false);
    expect(meta.verifySignature(raw, '', secret)).toBe(false);
    expect(meta.verifySignature(raw, sig, '')).toBe(false);
  });
});

describe('provider selection', () => {
  test('WHATSAPP_PROVIDER=meta resolves a provider implementing the full contract', () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    const { getWhatsAppProvider } = require('../../src/providers/whatsapp');
    const p = getWhatsAppProvider();
    ['sendTemplate', 'sendText', 'verifySignature'].forEach((m) => expect(typeof p[m]).toBe('function'));
  });
});
