/* ============================================================
   DentAI — visits data (ES module)
   TODAY ('2026-06-02') inlined directly to avoid cross-file import.
   ============================================================ */

export const visits = [
  { id: 'v1', patientId: 'p1', procedureId: 'proc_rct36', date: '2026-06-02', startTime: '09:30', durationMinutes: 45, status: 'arrived', visitNumber: 2, totalVisits: 4, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v2', patientId: 'p2', procedureId: null, date: '2026-06-02', startTime: '10:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v3', patientId: 'p4', procedureId: 'proc_crown14', date: '2026-06-02', startTime: '11:30', durationMinutes: 60, status: 'confirmed', visitNumber: 2, totalVisits: 3, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v4', patientId: 'p3', procedureId: null, date: '2026-06-02', startTime: '16:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v5', patientId: 'p1', procedureId: 'proc_rct36', date: '2026-05-26', startTime: '10:00', durationMinutes: 45, status: 'done', visitNumber: 1, totalVisits: 4, clinicalNotes: 'Access opening done. Pulp extirpated, working length established on mesial canals.', proceduresDone: 'Access opening, pulp extirpation', nextSteps: 'Cleaning & shaping next visit. Continue ibuprofen if tender.', medications: ['Ibuprofen 400mg'] },
  /* schedule fillers across the week */
  { id: 'v6', patientId: 'p4', procedureId: 'proc_scaling', date: '2026-06-03', startTime: '09:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v7', patientId: 'p2', procedureId: null, date: '2026-06-03', startTime: '14:00', durationMinutes: 45, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v8', patientId: 'p1', procedureId: 'proc_crown36', date: '2026-06-05', startTime: '11:00', durationMinutes: 60, status: 'confirmed', visitNumber: 1, totalVisits: 2, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v9', patientId: 'p3', procedureId: null, date: '2026-06-04', startTime: '15:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
];
