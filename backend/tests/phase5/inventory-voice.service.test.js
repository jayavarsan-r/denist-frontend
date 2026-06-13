jest.mock('../../src/services/ai/ai.service', () => ({ extractInventory: jest.fn() }));
jest.mock('../../src/config/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'eq', 'order'].forEach((m) => { q[m] = () => q; });
    q.then = (res) => res({ data: global.__catalog || [], error: null });
    return q;
  };
  return { from: () => chain() };
});

const aiService = require('../../src/services/ai/ai.service');
const { parseInventoryCommand } = require('../../src/services/inventory-voice.service');

const CATALOG = [
  { id: 'g', name: 'Latex Gloves', strength: null, unit: 'box', category: 'consumable', stock_qty: 12, low_stock_threshold: 10, aliases: ['gloves'], price_per_unit: 200 },
  { id: 'c', name: 'Composite', strength: null, unit: 'syringe', category: 'consumable', stock_qty: 3, low_stock_threshold: 5, aliases: [], price_per_unit: 800 },
];

beforeEach(() => { global.__catalog = CATALOG; aiService.extractInventory.mockReset(); });

test('restock intent resolves the item and attaches current_stock', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'restock', intent_confidence: 0.9, items: [{ name_span: 'gloves', qty: 50 }], query: null, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'restock 50 gloves');
  expect(out.intent).toBe('restock');
  expect(out.items[0].resolved_item_id).toBe('g');
  expect(out.items[0].current_stock).toBe(12);
});

test('query count answers deterministically from the catalog', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'query', intent_confidence: 0.95, items: [], query: { kind: 'count', target_span: 'composite' }, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'how much composite');
  expect(out.answer.kind).toBe('count');
  expect(out.answer.stock_qty).toBe(3);
});

test('reorder lists low-stock items from the DB, never the LLM', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'reorder', intent_confidence: 0.9, items: [], query: null, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'what should I reorder');
  expect(out.answer.kind).toBe('low_stock');
  expect(out.answer.items.map((i) => i.id)).toEqual(['c']); // 3 <= 5
});
