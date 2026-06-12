// Phase 1a — clinic_id is the multi-tenancy boundary. These tests pin the two
// mechanisms every data endpoint relies on:
//   1. BaseClinicRepository._scope → strict clinic_id (covered in base-repository.test.js)
//   2. requireClinicOwnership middleware → 404 (never 403) on cross-clinic access

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

// Mock the supabase client BEFORE the middleware requires it. (jest.mock factories
// may only reference variables prefixed with `mock`.)
const mockMaybeSingle = jest.fn();
jest.mock('../src/config/supabase', () => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })),
    })),
  })),
}));

const requireClinicOwnership = require('../src/middleware/requireClinicOwnership');

function run(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; resolve({ res: this, nextArg: undefined, nexted: false }); },
    };
    mw(req, res, (arg) => resolve({ res, nextArg: arg, nexted: true }));
  });
}

describe('requireClinicOwnership', () => {
  beforeEach(() => mockMaybeSingle.mockReset());

  test('passes through when the row belongs to the caller clinic', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'V1', clinic_id: 'C1', dentist_id: 'D9' }, error: null });
    const out = await run(requireClinicOwnership('visits', 'visitId'),
      { params: { visitId: 'V1' }, clinicId: 'C1', dentistId: 'D1' });
    expect(out.nexted).toBe(true);
    expect(out.nextArg).toBeUndefined();
  });

  test('404 on clinic mismatch — even when the caller created the row (dentist match)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'V1', clinic_id: 'C2', dentist_id: 'D1' }, error: null });
    const out = await run(requireClinicOwnership('visits', 'visitId'),
      { params: { visitId: 'V1' }, clinicId: 'C1', dentistId: 'D1' });
    expect(out.res.statusCode).toBe(404); // never 403: must not reveal the row exists
  });

  test('404 when the row does not exist', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const out = await run(requireClinicOwnership('xrays'),
      { params: { id: 'X1' }, clinicId: 'C1', dentistId: 'D1' });
    expect(out.res.statusCode).toBe(404);
  });

  test('pre-clinic account (no clinicId) falls back to dentist_id ownership', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'X1', clinic_id: null, dentist_id: 'D1' }, error: null });
    const out = await run(requireClinicOwnership('xrays'),
      { params: { id: 'X1' }, clinicId: undefined, dentistId: 'D1' });
    expect(out.nexted).toBe(true);
  });

  test('pre-clinic account cannot read another dentist\'s row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'X1', clinic_id: null, dentist_id: 'D2' }, error: null });
    const out = await run(requireClinicOwnership('xrays'),
      { params: { id: 'X1' }, clinicId: undefined, dentistId: 'D1' });
    expect(out.res.statusCode).toBe(404);
  });

  test('DB errors propagate to the error handler (next(err)), not a fake 404', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('boom') });
    const out = await run(requireClinicOwnership('visits', 'visitId'),
      { params: { visitId: 'V1' }, clinicId: 'C1', dentistId: 'D1' });
    expect(out.nexted).toBe(true);
    expect(out.nextArg).toBeInstanceOf(Error);
  });
});
