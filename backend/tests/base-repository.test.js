// Set minimal env BEFORE requiring config/supabase (it constructs the client at load).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const BaseClinicRepository = require('../src/repositories/base-clinic.repository');

// Chainable query mock that records the methods/args called on it.
function mockQuery() {
  const calls = [];
  const q = {};
  ['or', 'eq', 'is', 'select', 'order', 'range', 'in', 'gte', 'lte', 'neq'].forEach((m) => {
    q[m] = (...args) => { calls.push([m, ...args]); return q; };
  });
  q._calls = calls;
  return q;
}

describe('BaseClinicRepository scoping', () => {
  test('clinic + dentist scope uses an OR clause (legacy backward compat)', () => {
    const repo = new BaseClinicRepository('patients', { softDeleteColumn: 'is_deleted' });
    const q = mockQuery();
    repo._scope(q, { clinicId: 'C1', dentistId: 'D1' });
    expect(q._calls).toContainEqual(['or', 'clinic_id.eq.C1,dentist_id.eq.D1']);
  });

  test('clinic-only scope uses eq(clinic_id)', () => {
    const repo = new BaseClinicRepository('visits');
    const q = mockQuery();
    repo._scope(q, { clinicId: 'C1' });
    expect(q._calls).toContainEqual(['eq', 'clinic_id', 'C1']);
  });

  test('is_deleted soft-delete filters eq(is_deleted,false)', () => {
    const repo = new BaseClinicRepository('patients', { softDeleteColumn: 'is_deleted' });
    const q = mockQuery();
    repo._applySoftDelete(q);
    expect(q._calls).toContainEqual(['eq', 'is_deleted', false]);
  });

  test('deleted_at soft-delete filters is(deleted_at,null)', () => {
    const repo = new BaseClinicRepository('visits', { softDeleteColumn: 'deleted_at' });
    const q = mockQuery();
    repo._applySoftDelete(q);
    expect(q._calls).toContainEqual(['is', 'deleted_at', null]);
  });

  test('no soft-delete column => no extra filter applied', () => {
    const repo = new BaseClinicRepository('payments');
    const q = mockQuery();
    repo._applySoftDelete(q);
    expect(q._calls).toHaveLength(0);
  });

  test('softDelete throws for tables without a soft-delete column', async () => {
    const repo = new BaseClinicRepository('payments');
    await expect(repo.softDelete('id', { clinicId: 'C1' })).rejects.toThrow(/softDelete not supported/);
  });
});
