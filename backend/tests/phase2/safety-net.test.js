const { runSafetyChecks } = require('../../src/services/safety-net.service');

const patientCtx = (overrides = {}) => ({
  patient: { name: 'Asha', allergy_list: ['penicillin'], ...overrides.patient },
  activePlans: overrides.activePlans ?? [],
});

describe('safety net', () => {
  test('drug–allergy conflict: amoxicillin vs penicillin-class span match', () => {
    // The rule matches on substring both ways — "penicillin" allergy fires on a
    // span that contains it, e.g. the doctor saying the class name.
    const flags = runSafetyChecks({
      prescriptions: [{ medicine_name_span: 'penicillin V 500', frequency: 'TID', duration_days: 5 }],
      treatments: [],
    }, patientCtx());
    expect(flags.some((f) => f.type === 'drug_allergy_conflict' && f.severity === 'high')).toBe(true);
  });

  test('no allergy flag when prescriptions are unrelated', () => {
    const flags = runSafetyChecks({
      prescriptions: [{ medicine_name_span: 'ibuprofen 400', frequency: 'BD', duration_days: 3 }],
      treatments: [],
    }, patientCtx());
    expect(flags.filter((f) => f.type === 'drug_allergy_conflict')).toHaveLength(0);
  });

  test('missing frequency and duration each raise a medium flag', () => {
    const flags = runSafetyChecks({
      prescriptions: [{ medicine_name_span: 'metrogyl', frequency: null, duration_days: null }],
      treatments: [],
    }, patientCtx());
    expect(flags.some((f) => f.type === 'missing_frequency')).toBe(true);
    expect(flags.some((f) => f.type === 'missing_duration')).toBe(true);
  });

  test('procedure without a tooth number → low tooth_not_charted', () => {
    const flags = runSafetyChecks({
      prescriptions: [],
      treatments: [{ procedure_name_span: 'scaling', tooth_fdi: null, sitting_action: null }],
    }, patientCtx());
    expect(flags.some((f) => f.type === 'tooth_not_charted' && f.severity === 'low')).toBe(true);
  });

  test('completed sitting with no follow-up → no_followup_multisitting', () => {
    const flags = runSafetyChecks({
      prescriptions: [],
      treatments: [{ procedure_name_span: 'RCT', tooth_fdi: 36, sitting_action: 'completed' }],
      follow_up: null,
    }, patientCtx({ activePlans: [{ procedure_name: 'Root Canal Treatment', teeth: ['36'] }] }));
    expect(flags.some((f) => f.type === 'no_followup_multisitting')).toBe(true);
  });

  test('completed tooth with NO matching active plan → reconciliation flag', () => {
    const flags = runSafetyChecks({
      prescriptions: [],
      treatments: [{ procedure_name_span: 'rct', tooth_fdi: 47, sitting_action: 'completed' }],
      follow_up: { in_days: 7, reason: null },
    }, patientCtx({ activePlans: [{ procedure_name: 'Root Canal Treatment', teeth: ['36'] }] }));
    expect(flags.some((f) => f.type === 'no_active_plan_for_completion')).toBe(true);
  });

  test('clean extraction → empty flags array', () => {
    // Plan matching is first-word substring: "root canal" matches "Root Canal
    // Treatment" (an abbreviation like "rct" would not — by design it errs
    // toward flagging for the doctor rather than silently assuming).
    const flags = runSafetyChecks({
      prescriptions: [{ medicine_name_span: 'ibuprofen', frequency: 'BD', duration_days: 3 }],
      treatments: [{ procedure_name_span: 'root canal', tooth_fdi: 36, sitting_action: 'completed' }],
      follow_up: { in_days: 7, reason: 'next sitting' },
    }, patientCtx({ activePlans: [{ procedure_name: 'Root Canal Treatment', teeth: ['36'] }] }));
    expect(flags).toEqual([]);
  });
});
