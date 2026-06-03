/* ============================================================
   DentAI — lab orders data (ES module)
   ============================================================ */

export const labOrders = [
  { id: 'lab1', patientId: 'p1', patientName: 'Ramesh Kumar', procedureId: 'proc_crown36', procedureType: 'Crown', toothNumber: 36, labName: 'City Dental Lab', workDescription: 'PFM crown, tooth 36', sentDate: '2026-05-26', expectedReturnDate: '2026-06-02', actualReturnDate: '2026-06-01', status: 'received', costToClinic: 2500, chargedToPatient: 5000, notes: 'Standard PFM.', shade: 'A2', impressionType: 'Digital scan' },
  { id: 'lab2', patientId: 'p4', patientName: 'Anand Krishnan', procedureId: 'proc_crown14', procedureType: 'Crown', toothNumber: 14, labName: 'Precise Dental Lab', workDescription: 'Zirconia crown, tooth 14', sentDate: '2026-05-28', expectedReturnDate: '2026-06-06', actualReturnDate: null, status: 'sent', costToClinic: 3000, chargedToPatient: 6000, notes: '', shade: 'A1', impressionType: 'PVS impression' },
];
