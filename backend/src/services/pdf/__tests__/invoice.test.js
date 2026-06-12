const { generateStatementPdf } = require('../invoice.pdf');

test('renders patient statement PDF with balance', async () => {
  const buf = await generateStatementPdf({
    clinic: { name: 'Acme Dental' }, dentist: { name: 'Dr Rao' }, date: '2026-06-12',
    patient: { name: 'Ravi Kumar', phone: '9876543210' },
    payments: [{ payment_date: '2026-06-01', amount: 1000, payment_method: 'cash' }],
    plans: [{ procedure_name: 'RCT', estimated_cost: 6000 }],
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(900);
});
