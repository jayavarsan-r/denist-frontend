const { normalize, normalizeList, deriveSlots } = require('../src/services/ai/parsers/medicine.parser');

describe('medicine.parser', () => {
  test('unifies dosage/dose/strength aliases from the legacy controller schema', () => {
    const out = normalize({ name: 'Amoxicillin', dosage: '500mg', notes: 'after food', frequency: 'TDS' });
    expect(out.dose).toBe('500mg');
    expect(out.dosage).toBe('500mg');   // PrescriptionSheet reads this
    expect(out.strength).toBe('500mg'); // architecture-spec alias
    expect(out.instructions).toBe('after food'); // notes -> instructions
  });

  test('preserves the service schema (dose/timing/meal_timing_slots)', () => {
    const out = normalize({ name: 'Ibuprofen', dose: '400 mg', timing: 'After food', meal_timing_slots: { breakfast: true, lunch: false, dinner: true } });
    expect(out.dose).toBe('400 mg');
    expect(out.timing).toBe('After food');
    expect(out.mealTiming).toBe('After food');
    expect(out.meal_timing_slots).toEqual({ breakfast: true, lunch: false, dinner: true });
  });

  test('derives meal slots from frequency when none provided', () => {
    expect(deriveSlots('', 'Three times daily')).toEqual({ breakfast: true, lunch: true, dinner: true });
    expect(deriveSlots('', 'Twice daily')).toEqual({ breakfast: true, lunch: false, dinner: true });
    expect(deriveSlots('At bedtime', '')).toEqual({ breakfast: false, lunch: false, dinner: true });
    const out = normalize({ name: 'X', frequency: 'TDS' });
    expect(out.meal_timing_slots).toEqual({ breakfast: true, lunch: true, dinner: true });
  });

  test('normalizeList handles empty/non-array input', () => {
    expect(normalizeList(undefined)).toEqual([]);
    expect(normalizeList(null)).toEqual([]);
    expect(normalizeList([{ name: 'A' }])).toHaveLength(1);
  });
});
