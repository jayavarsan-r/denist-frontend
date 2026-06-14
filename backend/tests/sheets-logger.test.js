// The ONE invariant that matters for this service: it must never block the caller
// and never throw / reject into the consultation pipeline, whatever Sheets does.

jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');

const flush = () => new Promise((r) => setImmediate(r));

describe('sheets-logger.service', () => {
  const sheets = require('../src/services/sheets-logger.service');
  const ORIG = process.env.SHEETS_WEBHOOK_URL;

  beforeEach(() => { axios.post.mockReset(); });
  afterAll(() => { process.env.SHEETS_WEBHOOK_URL = ORIG; });

  test('no-op (no axios call) when SHEETS_WEBHOOK_URL is unset', async () => {
    delete process.env.SHEETS_WEBHOOK_URL;
    sheets.logConsultationRun({ draftId: 'd1', success: true });
    await flush();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('returns undefined synchronously — callers cannot block on it', () => {
    process.env.SHEETS_WEBHOOK_URL = 'https://example.test/exec';
    axios.post.mockResolvedValue({ data: { ok: true } });
    expect(sheets.logConsultationRun({ draftId: 'd1', success: true })).toBeUndefined();
    expect(sheets.logVerification({ draftId: 'd1', doctorEdited: true })).toBeUndefined();
  });

  test('posts a well-formed run payload', async () => {
    process.env.SHEETS_WEBHOOK_URL = 'https://example.test/exec';
    axios.post.mockResolvedValue({ data: { ok: true } });
    sheets.logConsultationRun({
      draftId: 'd1', clinicId: 'c1', jobId: 42, attemptNumber: 1,
      stt: { duration: 12, chunks: 3 }, gemini: { timeMs: 900 }, success: true, notes: 'ok',
    });
    await flush();
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('https://example.test/exec');
    expect(body).toMatchObject({ type: 'run', draftId: 'd1', clinicId: 'c1', success: true, jobId: '42' });
    expect(opts.timeout).toBeGreaterThan(0);
  });

  test('a rejected POST is swallowed — no throw, no unhandled rejection', async () => {
    process.env.SHEETS_WEBHOOK_URL = 'https://example.test/exec';
    axios.post.mockRejectedValue(new Error('sheet is down / rate limited'));
    const onUnhandled = jest.fn();
    process.on('unhandledRejection', onUnhandled);
    expect(() => sheets.logConsultationRun({ draftId: 'd1', success: false })).not.toThrow();
    await flush();
    await flush();
    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  test('ignores events with no draftId', async () => {
    process.env.SHEETS_WEBHOOK_URL = 'https://example.test/exec';
    sheets.logConsultationRun({ success: true });
    sheets.logVerification({ doctorEdited: true });
    await flush();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
