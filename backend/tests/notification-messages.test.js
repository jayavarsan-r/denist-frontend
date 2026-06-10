const { buildPrescriptionMessage, buildReminderMessage, buildPaymentDueMessage, buildRecallMessage } = require('../src/services/notifications/messages');

describe('notification messages', () => {
  test('prescription lists each medicine by name + frequency', () => {
    const msg = buildPrescriptionMessage({ name: 'Karthik' }, [
      { name: 'Amoxicillin 500mg', frequency: 'Twice daily', duration: '5 days' },
      { name: 'Zerodol SP', frequency: 'After food', duration: '3 days' },
    ]);
    expect(msg).toContain('Karthik');
    expect(msg).toContain('Amoxicillin 500mg');
    expect(msg).toContain('Twice daily');
    expect(msg).toContain('Zerodol SP');
  });
  test('prescription with no medicines is still a valid non-empty message', () => {
    const msg = buildPrescriptionMessage({ name: 'A' }, []);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
  test('reminder includes date + time', () => {
    expect(buildReminderMessage({ name: 'Meena' }, { appointment_date: '2026-06-15', appointment_time: '16:30', purpose: 'RCT' }))
      .toMatch(/2026-06-15.*16:30/s);
  });
  test('payment-due includes amount', () => {
    expect(buildPaymentDueMessage({ name: 'Raj' }, 1000)).toContain('1000');
  });
  test('recall includes reason + date', () => {
    expect(buildRecallMessage({ name: 'Aadhya' }, '2026-07-10', 'Ortho review')).toMatch(/Ortho review.*2026-07-10/s);
  });
});
