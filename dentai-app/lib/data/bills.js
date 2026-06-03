/* ============================================================
   DentAI — bills data (ES module)
   ============================================================ */

export const bills = [
  { id: 'bill1', patientId: 'p1', patientName: 'Ramesh Kumar', items: [
      { description: 'RCT — Tooth 36 (in progress)', quantity: 1, unitPrice: 6000, total: 6000 },
      { description: 'Digital X-ray (IOPA)', quantity: 1, unitPrice: 300, total: 300 },
    ], subtotal: 6300, discount: 300, total: 6000, paid: 3000, outstanding: 3000, createdAt: '2026-05-26', status: 'partial' },
  { id: 'bill2', patientId: 'p4', patientName: 'Anand Krishnan', items: [
      { description: 'Full mouth scaling & polish', quantity: 1, unitPrice: 2000, total: 2000 },
      { description: 'Consultation', quantity: 1, unitPrice: 500, total: 500 },
    ], subtotal: 2500, discount: 0, total: 2500, paid: 2500, outstanding: 0, createdAt: '2026-05-12', status: 'paid' },
];
