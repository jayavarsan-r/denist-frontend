process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const { DraftSchema } = require('../src/services/gemini-extraction.service');

describe('DraftSchema — diagnosis / sittings / cost', () => {
  test('parses the three new fields when present', () => {
    const r = DraftSchema.safeParse({
      treatments: [], prescriptions: [], clinical_notes: 'RCT done', unclear_spans: [],
      diagnosis: 'Irreversible pulpitis', total_sittings: 3, estimated_cost: 4500,
    });
    expect(r.success).toBe(true);
    expect(r.data.diagnosis).toBe('Irreversible pulpitis');
    expect(r.data.total_sittings).toBe(3);
    expect(r.data.estimated_cost).toBe(4500);
  });

  test('defaults the three new fields to null when omitted', () => {
    const r = DraftSchema.safeParse({
      treatments: [], prescriptions: [], clinical_notes: null, unclear_spans: [],
    });
    expect(r.success).toBe(true);
    expect(r.data.diagnosis).toBeNull();
    expect(r.data.total_sittings).toBeNull();
    expect(r.data.estimated_cost).toBeNull();
  });
});
