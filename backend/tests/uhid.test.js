const { clinicPrefix, formatUhid } = require('../src/utils/uhid');

describe('uhid', () => {
  test('clinicPrefix derives 3 uppercase letters from clinic name', () => {
    expect(clinicPrefix({ name: 'Velora Dental Studio' })).toBe('VEL');
    expect(clinicPrefix({ name: 'A B' })).toBe('AB'); // fewer than 3 letters is fine
  });
  test('clinicPrefix falls back to display_id prefix then PAT', () => {
    expect(clinicPrefix({ name: '', display_id: 'DENT-CHE-123' })).toBe('DENT');
    expect(clinicPrefix({})).toBe('PAT');
  });
  test('formatUhid zero-pads to 4 digits', () => {
    expect(formatUhid('VEL', 1)).toBe('VEL-0001');
    expect(formatUhid('VEL', 73)).toBe('VEL-0073');
    expect(formatUhid('VEL', 12345)).toBe('VEL-12345'); // no truncation past 4
  });
});
