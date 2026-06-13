// dentai-app/lib/documents/registry.js
// One place that knows each document's PDF endpoint, filename, and share title.
// docType ∈ 'prescription' | 'caseSheet' | 'statement'  (lab added in SP2).
function sanitize(name) {
  return String(name || 'patient').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'patient';
}
function today() { return new Date().toISOString().split('T')[0]; }

export const DOCUMENTS = {
  prescription: { endpoint: (id) => `/api/prescriptions/${id}/pdf`, label: 'Prescription', title: 'Prescription' },
  caseSheet:    { endpoint: (id) => `/api/patients/${id}/case-sheet/pdf`, label: 'Case Sheet', title: 'Case Sheet' },
  statement:    { endpoint: (id) => `/api/patients/${id}/statement/pdf`, label: 'Statement', title: 'Statement' },
};

export function docFilename(docType, patientName) {
  const d = DOCUMENTS[docType];
  return `${(d?.label || 'Document').replace(/\s+/g, '')}_${sanitize(patientName)}_${today()}.pdf`;
}
