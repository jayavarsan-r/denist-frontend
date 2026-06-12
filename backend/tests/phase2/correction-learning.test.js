// The learning loop: confirmed corrections come back as few-shots in the next
// consultation context for the same doctor — plain SQL, no vectors.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('./helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});

const sb = require('../../src/config/supabase');
const { buildConsultationContext, splitAllergies } = require('../../src/services/consultation-context.service');

const FEWSHOTS = [
  { raw_transcript: 'rct 36 started', corrections: { treatments: { ai_said: [], doctor_said: [] } } },
  { raw_transcript: 'scaling done', corrections: { clinical_notes: { ai_said: 'x', doctor_said: 'y' } } },
];

describe('correction learning (context builder)', () => {
  beforeEach(() => { sb._queries.length = 0; });

  test('fewShots return the doctor\'s confirmed corrections, query shaped correctly', async () => {
    global.__sbResolver = (table) => {
      if (table === 'patients') return { data: { id: 'P1', name: 'Asha', allergies: 'Penicillin, Latex' }, error: null };
      if (table === 'consultation_drafts') return { data: FEWSHOTS, error: null };
      if (table === 'treatment_plans') return { data: [{ id: 'TP1', procedure_name: 'RCT', total_sittings: 3, completed_sittings: 1, status: 'active' }], error: null };
      if (table === 'treatment_teeth') return { data: [{ treatment_plan_id: 'TP1', tooth_number: '36' }], error: null };
      return { data: [], error: null };
    };

    const ctx = await buildConsultationContext('C1', 'P1', 'DOC1');

    expect(ctx.fewShots).toEqual(FEWSHOTS);
    expect(ctx.patient.allergy_list).toEqual(['Penicillin', 'Latex']);
    expect(ctx.activePlans[0].teeth).toEqual(['36']);

    // The few-shot query: this doctor, confirmed, corrections present, newest first, max 10.
    const fsQuery = sb._queries.find((q) => q.table === 'consultation_drafts');
    const calls = fsQuery.calls;
    expect(calls).toContainEqual(['eq', 'doctor_id', 'DOC1']);
    expect(calls).toContainEqual(['eq', 'status', 'confirmed']);
    expect(calls).toContainEqual(['not', 'corrections', 'is', null]);
    expect(calls).toContainEqual(['not', 'raw_transcript', 'is', null]); // manual drafts excluded
    expect(calls).toContainEqual(['order', 'confirmed_at', { ascending: false }]);
    expect(calls).toContainEqual(['limit', 10]);
  });

  test('no doctorId → no few-shot query, empty list', async () => {
    global.__sbResolver = (table) => (table === 'patients'
      ? { data: { id: 'P1', name: 'A', allergies: null }, error: null }
      : { data: [], error: null });
    const ctx = await buildConsultationContext('C1', 'P1', null);
    expect(ctx.fewShots).toEqual([]);
    expect(sb._queries.find((q) => q.table === 'consultation_drafts')).toBeUndefined();
  });

  test('splitAllergies normalises free text and drops "none"', () => {
    expect(splitAllergies('penicillin, sulfa drugs / latex; aspirin')).toEqual(['penicillin', 'sulfa drugs', 'latex', 'aspirin']);
    expect(splitAllergies('None')).toEqual([]);
    expect(splitAllergies(null)).toEqual([]);
    expect(splitAllergies(['latex'])).toEqual(['latex']);
  });
});
