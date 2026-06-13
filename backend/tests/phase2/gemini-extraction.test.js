// Mock the Gemini provider so no network is touched.
jest.mock('../../src/services/ai/providers/gemini.provider', () => ({
  generate: jest.fn(),
  hasKey: () => true,
}));

const gemini = require('../../src/services/ai/providers/gemini.provider');
const { extractFromTranscript, DraftSchema } = require('../../src/services/gemini-extraction.service');
const { AppError } = require('../../src/utils/errors');

const ctx = { patient: { name: 'A', allergy_list: [] }, activePlans: [], lastVisit: null, medicines: [], procedureCatalog: [], fewShots: [] };

const VALID = {
  treatments: [{ procedure_name_span: 'root canal', procedure_code: 'RCT', tooth_fdi: 36, sitting_action: 'started', sitting_number: 1, notes: null }],
  prescriptions: [{ medicine_name_span: 'amoxicillin 500', dose: '500mg', frequency: 'TID', duration_days: 5, instructions: null }],
  follow_up: { in_days: 7, reason: 'sitting 2' },
  lab_case_suggestion: null,
  clinical_notes: 'RCT started on 36',
  unclear_spans: [],
};

describe('gemini extraction', () => {
  beforeEach(() => gemini.generate.mockReset());

  test('valid JSON parses clean with no low-confidence fields', async () => {
    gemini.generate.mockResolvedValue(VALID);
    const { data, lowConfidence } = await extractFromTranscript('t', ctx);
    expect(lowConfidence).toEqual([]);
    expect(data.treatments[0].tooth_fdi).toBe(36);
    expect(data.follow_up.in_days).toBe(7);
  });

  test('invalid tooth_fdi (99) drops that treatment and reports the path', async () => {
    gemini.generate.mockResolvedValue({
      ...VALID,
      treatments: [
        { ...VALID.treatments[0] },
        { ...VALID.treatments[0], tooth_fdi: 99 }, // 9 is not a valid tooth digit
      ],
    });
    const { data, lowConfidence } = await extractFromTranscript('t', ctx);
    expect(data.treatments).toHaveLength(1); // the bad entry is salvaged away
    expect(lowConfidence.some((p) => p.startsWith('treatments.1'))).toBe(true);
  });

  test('FDI 19 is rejected too (valid range is quadrant 1-4 × tooth 1-8)', () => {
    const r = DraftSchema.safeParse({ ...VALID, treatments: [{ ...VALID.treatments[0], tooth_fdi: 19 }] });
    expect(r.success).toBe(false);
  });

  test('bad frequency enum salvages the rest, does not throw', async () => {
    gemini.generate.mockResolvedValue({
      ...VALID,
      prescriptions: [{ ...VALID.prescriptions[0], frequency: 'TWICE' }],
    });
    const { data, lowConfidence } = await extractFromTranscript('t', ctx);
    expect(data.prescriptions).toHaveLength(0);
    expect(lowConfidence.length).toBeGreaterThan(0);
    expect(data.clinical_notes).toBe('RCT started on 36'); // rest survives
  });

  test('provider LLM_UNAVAILABLE propagates as a typed 503', async () => {
    gemini.generate.mockRejectedValue(new AppError('LLM_UNAVAILABLE', 'down'));
    await expect(extractFromTranscript('t', ctx)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE', status: 503 });
  });

  test('non-object payload → EXTRACTION_FAILED 422', async () => {
    gemini.generate.mockResolvedValue(['not', 'an', 'object']);
    await expect(extractFromTranscript('t', ctx)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED', status: 422 });
  });
});
