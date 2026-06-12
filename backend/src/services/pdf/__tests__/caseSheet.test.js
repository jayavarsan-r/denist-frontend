const { generateCaseSheetPdf } = require('../caseSheet.pdf');

test('renders case sheet PDF with patient + sections', async () => {
  const buf = await generateCaseSheetPdf({
    clinic: { name: 'Acme Dental' }, dentist: { name: 'Dr Rao' }, date: '2026-06-12',
    caseSheet: {
      patient: { name: 'Ravi Kumar', age: 34, gender: 'Male', phone: '9876543210' },
      visits: [{ visit_date: '2026-06-01', procedure_name: 'Scaling', cost: 1500 }],
      prescriptions: [{ created_at: '2026-06-01', medicines: [{ name: 'Amoxicillin' }] }],
      allTreatmentPlans: [{ procedure_name: 'RCT', status: 'active', estimated_cost: 6000 }],
      summary: { totalBilled: 1500, totalCollected: 1000, pendingAmount: 500 },
    },
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
});
