const { isWorkingDay, nextWorkingDay, pickSlot } = require('../src/utils/scheduling');

// 2026-06-21 is a Sunday; 2026-06-22 is a Monday. Parsed as LOCAL time (no Z) so
// getDay()/setDate() in the util stay consistent; format with local parts (not
// toISOString, which would shift the date by the UTC offset).
const sunday = new Date('2026-06-21T00:00:00');
const monday = new Date('2026-06-22T00:00:00');
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('isWorkingDay', () => {
  test('weekday in set is working', () => {
    expect(isWorkingDay(monday, [1, 2, 3, 4, 5, 6])).toBe(true);
  });
  test('Sunday excluded when set uses neither 0 nor 7', () => {
    expect(isWorkingDay(sunday, [1, 2, 3, 4, 5, 6])).toBe(false);
  });
  test('Sunday accepted whether encoded as 7 or 0', () => {
    expect(isWorkingDay(sunday, [1, 7])).toBe(true);
    expect(isWorkingDay(sunday, [0, 1])).toBe(true);
  });
});

describe('nextWorkingDay', () => {
  test('rolls Sunday forward to Monday when Sunday is closed', () => {
    const d = nextWorkingDay(sunday, [1, 2, 3, 4, 5, 6]);
    expect(localDate(d)).toBe('2026-06-22');
  });
  test('keeps a date that is already a working day', () => {
    const d = nextWorkingDay(monday, [1, 2, 3, 4, 5, 6]);
    expect(localDate(d)).toBe('2026-06-22');
  });
});

describe('pickSlot', () => {
  const open = 10 * 60, close = 18 * 60; // 600..1080
  test('empty day returns the open minute', () => {
    expect(pickSlot([], open, close, 30, [])).toBe(600);
  });
  test('skips a booked first slot', () => {
    expect(pickSlot([[600, 630]], open, close, 30, [])).toBe(630);
  });
  test('avoids minutes already picked this confirm', () => {
    expect(pickSlot([], open, close, 30, [600])).toBe(630);
  });
  test('falls back to open when the day is full', () => {
    const allBooked = [[open, close]];
    expect(pickSlot(allBooked, open, close, 30, [])).toBe(600);
  });
});
