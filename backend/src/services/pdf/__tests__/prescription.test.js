const { generatePrescriptionPdf } = require('../prescription.pdf');

test('renders a valid PDF containing patient + medicine', async () => {
  const buf = await generatePrescriptionPdf({
    patient: { name: 'Ravi Kumar', age: 34, gender: 'Male' },
    clinic: { name: 'Acme Dental', address: '12 MG Rd', phone: '044-1' },
    dentist: { name: 'Dr Rao' },
    date: '2026-06-12',
    medicines: [{ name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', meal_timing_slots: { breakfast: true, lunch: true, dinner: true } }],
    instructions: 'Rinse with warm salt water.',
    followUp: 'Review in 5 days',
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
});

test('empty medicines renders without throwing', async () => {
  const buf = await generatePrescriptionPdf({ patient: { name: 'X' }, clinic: {}, dentist: {}, date: '2026-06-12', medicines: [], instructions: '', followUp: null });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
});
