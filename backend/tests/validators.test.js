const v = require('../src/validators');

describe('validators', () => {
  test('createPatient requires name+phone and strips unknown keys', () => {
    const ok = v.createPatient.safeParse({ name: 'Asha', phone: '9876543210', age: '34', evil: 'DROP TABLE' });
    expect(ok.success).toBe(true);
    expect(ok.data.age).toBe(34);        // coerced
    expect('evil' in ok.data).toBe(false); // stripped (whitelist)

    const bad = v.createPatient.safeParse({ name: 'NoPhone' });
    expect(bad.success).toBe(false);
  });

  test('phone must be 10 digits', () => {
    expect(v.createPatient.safeParse({ name: 'A', phone: '123' }).success).toBe(false);
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210' }).success).toBe(true);
  });

  test('uuid fields accept real ids, reject garbage', () => {
    expect(v.addToQueue.safeParse({ patientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }).success).toBe(true);
    expect(v.addToQueue.safeParse({ patientId: 'not-a-uuid' }).success).toBe(false);
  });

  test('completeConsult requires patientId + non-empty procedure', () => {
    expect(v.completeConsult.safeParse({ patientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', procedure: 'RCT' }).success).toBe(true);
    expect(v.completeConsult.safeParse({ patientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', procedure: '' }).success).toBe(false);
  });

  test('appointment status accepts the new "suggested"', () => {
    expect(v.updateAppointment.safeParse({ status: 'suggested' }).success).toBe(true);
    expect(v.updateAppointment.safeParse({ status: 'bogus' }).success).toBe(false);
  });

  test('payment amount must be positive', () => {
    const uid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    expect(v.recordPayment.safeParse({ patientId: uid, amount: '500' }).success).toBe(true);
    expect(v.recordPayment.safeParse({ patientId: uid, amount: '-5' }).success).toBe(false);
  });
});
