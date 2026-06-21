process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const { DraftSchema, applyCostFallback } = require('../src/services/gemini-extraction.service');

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

describe('applyCostFallback', () => {
  const catalog = [{ code: 'RCT', default_fee: 3000 }, { code: 'CRWN', default_fee: 5000 }];

  test('leaves a stated cost untouched', () => {
    const ex = { estimated_cost: 4500, total_sittings: 3, treatments: [{ procedure_code: 'RCT' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(4500);
  });

  test('derives fee x sittings when cost is null and a code matches', () => {
    const ex = { estimated_cost: null, total_sittings: 3, treatments: [{ procedure_code: 'RCT' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(9000); // 3000 x 3
  });

  test('defaults sittings to 1 when null', () => {
    const ex = { estimated_cost: null, total_sittings: null, treatments: [{ procedure_code: 'CRWN' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(5000);
  });

  test('stays null when no catalog code matches', () => {
    const ex = { estimated_cost: null, total_sittings: 2, treatments: [{ procedure_code: null }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBeNull();
  });
});
