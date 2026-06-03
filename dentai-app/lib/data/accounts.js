/* ============================================================
   DentAI — clinic accounts data (ES module)
   ============================================================ */

export const clinicAccounts = [
  { id: 'a1', date: '2026-06-02', type: 'income', category: 'Treatment', description: 'Ramesh Kumar — RCT part payment', amount: 3000, patientId: 'p1', labOrderId: null },
  { id: 'a2', date: '2026-06-01', type: 'expense', category: 'Lab', description: 'City Dental Lab — crown T36', amount: 2500, patientId: 'p1', labOrderId: 'lab1' },
  { id: 'a3', date: '2026-05-30', type: 'income', category: 'Treatment', description: 'Walk-in extraction — cash', amount: 1500, patientId: null, labOrderId: null },
  { id: 'a4', date: '2026-05-28', type: 'expense', category: 'Lab', description: 'Precise Dental Lab — crown T14', amount: 3000, patientId: 'p4', labOrderId: 'lab2' },
  { id: 'a5', date: '2026-05-26', type: 'income', category: 'Treatment', description: 'Ramesh Kumar — X-ray + access', amount: 3300, patientId: 'p1', labOrderId: null },
  { id: 'a6', date: '2026-05-24', type: 'expense', category: 'Supplies', description: 'Composite & burs restock', amount: 4200, patientId: null, labOrderId: null },
  { id: 'a7', date: '2026-05-20', type: 'income', category: 'Treatment', description: 'Crown impression — Anand', amount: 2000, patientId: 'p4', labOrderId: null },
  { id: 'a8', date: '2026-05-15', type: 'expense', category: 'Rent', description: 'Clinic rent — May', amount: 28000, patientId: null, labOrderId: null },
  { id: 'a9', date: '2026-05-12', type: 'income', category: 'Treatment', description: 'Anand Krishnan — scaling & polish', amount: 2500, patientId: 'p4', labOrderId: null },
  { id: 'a10', date: '2026-05-10', type: 'income', category: 'Treatment', description: 'Priya Sundaram — consultation', amount: 500, patientId: 'p3', labOrderId: null },
];
