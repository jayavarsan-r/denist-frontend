// resolveInventorySpan is pure; mock config/supabase only so the module imports
// without a live SUPABASE_URL (the rest of inventory.service requires the client).
jest.mock('../../src/config/supabase', () => ({ from: () => ({}) }));

const { resolveInventorySpan } = require('../../src/services/inventory.service');

const CATALOG = [
  { id: 'a', name: 'Amoxicillin', strength: '500mg', unit: 'capsule', category: 'medicine', stock_qty: 100, low_stock_threshold: 20, aliases: [] },
  { id: 'a2', name: 'Amoxicillin', strength: '250mg', unit: 'capsule', category: 'medicine', stock_qty: 50, low_stock_threshold: 20, aliases: [] },
  { id: 'g', name: 'Latex Gloves', strength: null, unit: 'box', category: 'consumable', stock_qty: 12, low_stock_threshold: 10, aliases: ['gloves'] },
  { id: 'n', name: 'Sodium Hypochlorite', strength: '3%', unit: 'bottle', category: 'consumable', stock_qty: 8, low_stock_threshold: 5, aliases: ['naocl', 'sodium hypo'] },
  { id: 'z', name: 'Zirconia Block', strength: null, unit: 'piece', category: 'equipment', stock_qty: 4, low_stock_threshold: 2, aliases: [] },
];

describe('resolveInventorySpan', () => {
  test('exact name (single match)', () => {
    const r = resolveInventorySpan(CATALOG, 'Sodium Hypochlorite');
    expect(r.resolved_item_id).toBe('n');
    expect(r.match_reason).toBe('exact_name');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('alias match (NaOCl)', () => {
    const r = resolveInventorySpan(CATALOG, 'NaOCl');
    expect(r.resolved_item_id).toBe('n');
    expect(r.match_reason).toBe('alias_match');
  });

  test('strength disambiguation between duplicate names', () => {
    const r = resolveInventorySpan(CATALOG, 'amoxicillin', { strength: '250mg' });
    expect(r.resolved_item_id).toBe('a2');
    expect(r.match_reason).toBe('strength_match');
  });

  test('ambiguous duplicate names without a hint → candidates, low confidence', () => {
    const r = resolveInventorySpan(CATALOG, 'amoxicillin');
    expect(r.resolved_item_id).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['a', 'a2']);
    expect(r.confidence).toBeLessThan(0.6);
  });

  test('non-medicine fuzzy/alias match (gloves)', () => {
    const r = resolveInventorySpan(CATALOG, 'gloves');
    expect(r.resolved_item_id).toBe('g');
  });

  test('unknown span → none', () => {
    const r = resolveInventorySpan(CATALOG, 'titanium screws');
    expect(r.resolved_item_id).toBeNull();
    expect(r.match_reason).toBe('none');
    expect(r.confidence).toBe(0);
  });
});
