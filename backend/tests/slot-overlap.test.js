const { toMinutes, overlaps } = require('../src/utils/slot-overlap');

describe('slot-overlap', () => {
  test('toMinutes parses HH:MM', () => {
    expect(toMinutes('10:15')).toBe(615);
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes(null)).toBe(null);
    expect(toMinutes('bad')).toBe(null);
  });
  test('overlaps detects intersecting windows', () => {
    expect(overlaps('10:00', 30, '10:15', 30)).toBe(true);
    expect(overlaps('10:00', 30, '10:00', 30)).toBe(true);
    expect(overlaps('10:00', 60, '10:30', 15)).toBe(true);
    expect(overlaps('10:00', 30, '10:30', 30)).toBe(false);
    expect(overlaps('10:00', 30, '11:00', 30)).toBe(false);
  });
  test('overlaps is false when either time is missing (date-only suggestions)', () => {
    expect(overlaps(null, 30, '10:00', 30)).toBe(false);
    expect(overlaps('10:00', 30, null, 30)).toBe(false);
  });
});
