const inventoryPrompt = require('../../src/services/ai/prompts/inventory.prompt');

test('prompt injects the catalog and the intent schema rules', () => {
  const p = inventoryPrompt([
    { name: 'Amoxicillin', strength: '500mg', category: 'medicine', aliases: [] },
    { name: 'Latex Gloves', strength: null, category: 'consumable', aliases: ['gloves'] },
  ]);
  expect(typeof p).toBe('string');
  expect(p).toContain('Amoxicillin');
  expect(p).toContain('Latex Gloves');
  expect(p).toContain('intent_confidence');
  expect(p).toContain('set_to_level');
  // language coverage
  expect(p.toLowerCase()).toContain('any');
});

test('empty catalog still returns a valid string', () => {
  expect(typeof inventoryPrompt([])).toBe('string');
});
