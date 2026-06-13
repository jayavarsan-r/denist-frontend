jest.mock('../../../config/supabase', () => {
  const rows = {
    clinics: { id: 'c1', name: 'Acme Dental', address: '12 MG Rd', phone: '044-1', registration_number: 'KA-9' },
    staff: { name: 'Dr Rao', registration_number: 'D-1', clinics: { name: 'Acme Dental', address: '12 MG Rd', phone: '044-1', registration_number: 'KA-9' } },
  };
  const make = (table) => ({
    select() { return this; }, eq() { return this; },
    single: async () => ({ data: rows[table], error: null }),
  });
  return { from: (t) => make(t) };
});
const { loadBrandingContext } = require('../branding.data');

test('loads clinic + dentist branding from req', async () => {
  const ctx = await loadBrandingContext({ clinicId: 'c1', staffId: 's1' });
  expect(ctx.clinic.name).toBe('Acme Dental');
  expect(ctx.dentist.name).toBe('Dr Rao');
  expect(ctx.dentist.registration_number).toBe('D-1');
});
