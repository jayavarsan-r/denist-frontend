jest.mock('../../src/services/ai/providers/gemini.provider', () => ({
  generate: jest.fn(),
  hasKey: () => true,
}));
const gemini = require('../../src/services/ai/providers/gemini.provider');
const aiService = require('../../src/services/ai/ai.service');

beforeEach(() => gemini.generate.mockReset());

test('extractInventory passes the catalog-injected prompt + transcript and returns parsed JSON', async () => {
  const parsed = { intent: 'restock', intent_confidence: 0.9, items: [{ name_span: 'gloves', qty: 50 }], query: null, unclear_spans: [] };
  gemini.generate.mockResolvedValue(parsed);

  const out = await aiService.extractInventory('restock 50 gloves', [{ name: 'Latex Gloves', category: 'consumable', aliases: ['gloves'] }]);

  expect(out).toEqual(parsed);
  const [systemPrompt, userContent, opts] = gemini.generate.mock.calls[0];
  expect(systemPrompt).toContain('Latex Gloves');
  expect(userContent).toBe('restock 50 gloves');
  expect(opts.temperature).toBe(0);
});
