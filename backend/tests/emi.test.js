const { installmentsFor, advanceDueDate, buildSchedule } = require('../src/utils/emi');

describe('emi', () => {
  test('installmentsFor ceilings (total-advance)/emi', () => {
    expect(installmentsFor(85000, 20000, 5000)).toBe(13);
    expect(installmentsFor(40500, 20000, 5000)).toBe(5);
    expect(installmentsFor(1000, 1000, 5000)).toBe(0);
    expect(installmentsFor(1000, 0, 0)).toBe(0);
  });
  test('advanceDueDate steps by frequency', () => {
    expect(advanceDueDate('2026-06-10', 'monthly')).toBe('2026-07-10');
    expect(advanceDueDate('2026-06-10', 'weekly')).toBe('2026-06-17');
    expect(advanceDueDate('2026-06-10', 'biweekly')).toBe('2026-06-24');
  });
  test('buildSchedule returns n dated installments of emi', () => {
    const s = buildSchedule('2026-06-10', 'monthly', 2, 5000);
    expect(s).toEqual([
      { dueDate: '2026-07-10', amount: 5000 },
      { dueDate: '2026-08-10', amount: 5000 },
    ]);
  });
});
