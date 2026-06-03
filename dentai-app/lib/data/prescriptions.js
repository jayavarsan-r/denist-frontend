/* ============================================================
   DentAI — prescriptions data (ES module)
   ============================================================ */

export const prescriptions = [
  { id: 'rx1', patientId: 'p1', patientName: 'Ramesh Kumar', date: '2026-05-26', medicines: [
      { name: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: 'BD', duration: '3 days', notes: 'After food' },
      { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: 'TDS', duration: '5 days', notes: '' },
    ], instructions: 'Take after meals. Avoid chewing on the treated side.', followUpDays: 7 },
  { id: 'rx2', patientId: 'p4', patientName: 'Anand Krishnan', date: '2026-05-12', medicines: [
      { name: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'BD', duration: '7 days', notes: 'Rinse for 30s' },
      { name: 'Paracetamol 500mg', dosage: '1 tablet', frequency: 'SOS', duration: '3 days', notes: 'If pain' },
    ], instructions: 'Warm saline rinses twice daily. Maintain blood sugar control.', followUpDays: 14 },
];
