// Medicine span → inventory item resolution (used by the voice worker).
// Strategy under test: exact → first-word prefix → strength disambiguation.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('../phase2/helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});

const sb = require('../../src/config/supabase');
const { resolveMedicineSpan } = require('../../src/services/inventory.service');

const AMOX_500 = { id: 'A500', name: 'Amoxicillin', strength: '500mg', unit: 'capsule', price_per_unit: 4, stock_qty: 100, low_stock_threshold: 20 };
const AMOX_250 = { id: 'A250', name: 'Amoxicillin', strength: '250mg', unit: 'capsule', price_per_unit: 2.5, stock_qty: 50, low_stock_threshold: 10 };

// The exact-match query ilikes the full span; the fuzzy one ilikes 'FirstWord%'.
const ilikePattern = (calls) => calls.find(([m]) => m === 'ilike')?.[2];

describe('medicine resolution', () => {
  beforeEach(() => { sb._queries.length = 0; });

  test('exact name match → confident, price + stock attached', async () => {
    global.__sbResolver = (table, calls) =>
      (ilikePattern(calls) === 'Paracetamol'
        ? { data: [{ ...AMOX_500, id: 'P1', name: 'Paracetamol', strength: '500mg', price_per_unit: 1 }], error: null }
        : { data: [], error: null });
    const out = await resolveMedicineSpan('C1', { medicine_name_span: 'Paracetamol' });
    expect(out.resolution_confident).toBe(true);
    expect(out.resolved_name).toBe('Paracetamol');
    expect(out.price_per_unit).toBe(1);
  });

  test('single first-word candidate → confident', async () => {
    global.__sbResolver = (table, calls) => {
      const p = ilikePattern(calls);
      if (p === 'Amoxicillin%') return { data: [AMOX_500], error: null };
      return { data: [], error: null };
    };
    const out = await resolveMedicineSpan('C1', { medicine_name_span: 'Amoxicillin three times a day' });
    expect(out.resolution_confident).toBe(true);
    expect(out.resolved_item_id).toBe('A500');
  });

  test('multiple candidates + spoken strength → disambiguated, confident', async () => {
    global.__sbResolver = (table, calls) => {
      const p = ilikePattern(calls);
      if (p === 'Amoxicillin%') return { data: [AMOX_250, AMOX_500], error: null };
      return { data: [], error: null };
    };
    const out = await resolveMedicineSpan('C1', { medicine_name_span: 'Amoxicillin 500 mg' });
    expect(out.resolution_confident).toBe(true);
    expect(out.resolved_item_id).toBe('A500');
    expect(out.resolved_strength).toBe('500mg');
  });

  test('multiple candidates, no strength hint → first candidate, NOT confident (amber)', async () => {
    global.__sbResolver = (table, calls) => {
      const p = ilikePattern(calls);
      if (p === 'Amoxicillin%') return { data: [AMOX_250, AMOX_500], error: null };
      return { data: [], error: null };
    };
    const out = await resolveMedicineSpan('C1', { medicine_name_span: 'Amoxicillin' });
    expect(out.resolution_confident).toBe(false);
    expect(out.resolved_item_id).toBe('A250'); // surfaced for the doctor to verify
  });

  test('no match → unresolved, keeps the spoken span as the name', async () => {
    global.__sbResolver = () => ({ data: [], error: null });
    const out = await resolveMedicineSpan('C1', { medicine_name_span: 'Mystorin Forte' });
    expect(out.resolved_item_id).toBeNull();
    expect(out.resolved_name).toBe('Mystorin Forte');
    expect(out.resolution_confident).toBe(false);
  });

  test('empty span and a missing table both resolve gracefully (never throw)', async () => {
    global.__sbResolver = () => { throw new Error('relation "inventory_items" does not exist'); };
    const broken = await resolveMedicineSpan('C1', { medicine_name_span: 'Ibuprofen' });
    expect(broken.resolved_item_id).toBeNull();
    const empty = await resolveMedicineSpan('C1', { medicine_name_span: '' });
    expect(empty.resolution_confident).toBe(false);
  });
});
