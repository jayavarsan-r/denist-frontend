const { buildSchedule } = require('../src/utils/recurrence');

describe('recurrence', () => {
  test('buildSchedule returns count dates at intervalDays spacing', () => {
    expect(buildSchedule('2026-06-10', 30, 3)).toEqual(['2026-06-10', '2026-07-10', '2026-08-09']);
  });
  test('weekly spacing', () => {
    expect(buildSchedule('2026-06-10', 7, 2)).toEqual(['2026-06-10', '2026-06-17']);
  });
  test('count is clamped to [0, 60]', () => {
    expect(buildSchedule('2026-06-10', 30, 0)).toEqual([]);
    expect(buildSchedule('2026-06-10', 30, 999).length).toBe(60);
  });
});
