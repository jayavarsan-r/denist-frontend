const { computeCorrections } = require('../../src/utils/draft-diff');

const extracted = {
  treatments: [{ procedure_name_span: 'root canal', tooth_fdi: 36, sitting_action: 'started' }],
  prescriptions: [{
    medicine_name_span: 'amoxicillin', frequency: 'TID', duration_days: 5,
    resolved_name: 'Amoxicillin 500mg', resolved_item_id: 'i1', price_per_unit: 8, stock_qty: 100, resolution_confident: true,
  }],
  follow_up: { in_days: 7, reason: null },
  lab_case_suggestion: null,
  clinical_notes: 'RCT started on 36',
};

describe('correction pair computation', () => {
  test('identical confirm (modulo resolution decorations) → no corrections', () => {
    const confirmed = JSON.parse(JSON.stringify(extracted));
    // The card may strip/alter derived fields — that must NOT count as a correction.
    delete confirmed.prescriptions[0].resolved_item_id;
    confirmed.prescriptions[0].price_per_unit = null;
    expect(computeCorrections(extracted, confirmed)).toEqual({});
  });

  test('doctor changing a tooth number is recorded with both sides', () => {
    const confirmed = JSON.parse(JSON.stringify(extracted));
    confirmed.treatments[0].tooth_fdi = 37;
    const corr = computeCorrections(extracted, confirmed);
    expect(Object.keys(corr)).toEqual(['treatments']);
    expect(corr.treatments.ai_said[0].tooth_fdi).toBe(36);
    expect(corr.treatments.doctor_said[0].tooth_fdi).toBe(37);
  });

  test('clearing the follow-up and editing notes are both captured', () => {
    const confirmed = { ...JSON.parse(JSON.stringify(extracted)), follow_up: null, clinical_notes: 'RCT initiated, 36' };
    const corr = computeCorrections(extracted, confirmed);
    expect(corr.follow_up).toEqual({ ai_said: { in_days: 7, reason: null }, doctor_said: null });
    expect(corr.clinical_notes.doctor_said).toBe('RCT initiated, 36');
  });

  test('UI extras (total_sittings etc.) are not canonical fields and never diff', () => {
    const confirmed = { ...JSON.parse(JSON.stringify(extracted)), total_sittings: 4, estimated_cost: 6000 };
    expect(computeCorrections(extracted, confirmed)).toEqual({});
  });
});
