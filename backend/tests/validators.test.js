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

  // Phase 2: complete-consult confirms an AI draft — body is { draft_id, confirmed_data }.
  const uid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  test('confirmDraft: requires a draft_id uuid and a confirmed_data object', () => {
    expect(v.confirmDraft.safeParse({ draft_id: uid, confirmed_data: {} }).success).toBe(true);
    expect(v.confirmDraft.safeParse({ confirmed_data: {} }).success).toBe(false);     // no draft_id
    expect(v.confirmDraft.safeParse({ draft_id: 'nope', confirmed_data: {} }).success).toBe(false);
    expect(v.confirmDraft.safeParse({ draft_id: uid }).success).toBe(false);          // no confirmed_data
  });

  test('confirmDraft: confirmed_data carries treatments/prescriptions/follow_up through', () => {
    const parsed = v.confirmDraft.safeParse({
      draft_id: uid,
      confirmed_data: {
        treatments: [{ procedure_name_span: 'root canal', tooth_fdi: 36, sitting_action: 'started' }],
        prescriptions: [{ medicine_name_span: 'amoxicillin', frequency: 'TID', duration_days: 5 }],
        follow_up: { in_days: 7, reason: 'RCT review' },
        clinical_notes: 'Deep caries 36',
        total_sittings: 3,
        estimated_cost: 6000,
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.confirmed_data.treatments).toHaveLength(1);
    expect(parsed.data.confirmed_data.follow_up.in_days).toBe(7);
    expect(parsed.data.confirmed_data.total_sittings).toBe(3);
  });

  test('reviewDraft: confirm needs a valid status; reject needs no confirmed_data', () => {
    expect(v.reviewDraft.safeParse({ status: 'rejected' }).success).toBe(true);
    expect(v.reviewDraft.safeParse({ status: 'confirmed', confirmed_data: { clinical_notes: 'x' } }).success).toBe(true);
    expect(v.reviewDraft.safeParse({ status: 'pending_review' }).success).toBe(false);
  });

  test('gender is case-insensitive and trimmed', () => {
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: 'Male' }).data.gender).toBe('male');
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: ' FEMALE ' }).data.gender).toBe('female');
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: 'alien' }).success).toBe(false);
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
