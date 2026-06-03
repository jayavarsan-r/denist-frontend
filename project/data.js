/* ============================================================
   DentWay — mock data, utils, procedure stages
   Plain JS. Loaded before babel scripts. Exports to window.
   ============================================================ */

const TODAY = '2026-06-02'; // Tuesday

/* ---------- procedure stage templates ---------- */
const PROCEDURE_STAGES = {
  RCT: ["Diagnosis & X-ray", "Access Opening", "Cleaning & Shaping", "Medication & Temporary", "Obturation", "Crown Recommendation"],
  Implant: ["Consultation & Planning", "Implant Placement", "Osseointegration", "Abutment Placement", "Crown Placement"],
  Scaling: ["Full Mouth Scaling", "Polish"],
  Extraction: ["Anesthesia & Extraction", "Socket Inspection"],
  Crown: ["Tooth Preparation", "Impression", "Temporary Crown", "Fitting & Cementation"],
};

const FREQUENT_MEDICINES = [
  "Amoxicillin 500mg", "Ibuprofen 400mg", "Paracetamol 500mg", "Metronidazole 400mg",
  "Clindamycin 300mg", "Diclofenac 50mg", "Pantoprazole 40mg", "Cetirizine 10mg",
  "Tramadol 50mg", "Chlorhexidine Mouthwash",
];

const PROCEDURE_TYPES = ["RCT", "Extraction", "Scaling", "Crown", "Implant", "Filling", "Orthodontics"];

/* procedure color system (block bg + border + dot) */
const PROC_COLORS = {
  RCT:        { bg: '#EEF2FF', border: '#6366F1', dot: '#6366F1' },
  Extraction: { bg: '#FFF1F2', border: '#FF3B30', dot: '#FF3B30' },
  Scaling:    { bg: '#F0FDF4', border: '#34C759', dot: '#34C759' },
  Crown:      { bg: '#FAF5FF', border: '#BF5AF2', dot: '#BF5AF2' },
  Implant:    { bg: '#F0FDFA', border: '#32ADE6', dot: '#32ADE6' },
  Filling:    { bg: '#EFF6FF', border: '#007AFF', dot: '#007AFF' },
  Other:      { bg: '#F9FAFB', border: '#6E6E73', dot: '#6E6E73' },
};
function getProcedureColor(type) { return PROC_COLORS[type] || PROC_COLORS.Other; }

/* ---------- patients ---------- */
const patients = [
  {
    id: 'p1', name: 'Ramesh Kumar', phone: '+91 98401 22314', age: 42, gender: 'Male',
    bloodGroup: 'O+', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [],
    clinicalNotes: 'Sensitive to cold on lower left. Advised soft diet during RCT.',
    chiefComplaint: 'Sharp pain in lower left back tooth, worse at night.',
    status: 'current', createdAt: '2026-04-18',
    teeth: { 36: 'rct', 37: 'filling', 16: 'crown', 46: 'healthy' },
  },
  {
    id: 'p2', name: 'Meena Rajan', phone: '+91 99620 88107', age: 56, gender: 'Female',
    bloodGroup: 'B+', hasDiabetes: true, hasHypertension: true, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: ['Penicillin'],
    currentMedications: ['Metformin 500mg', 'Amlodipine 5mg'],
    clinicalNotes: 'Diabetic — monitor healing. Avoid penicillin-class antibiotics.',
    chiefComplaint: 'Bleeding gums while brushing for past 3 weeks.',
    status: 'current', createdAt: '2026-03-02',
    teeth: { 24: 'infection', 25: 'scheduled', 11: 'healthy' },
  },
  {
    id: 'p3', name: 'Priya Sundaram', phone: '+91 90031 45562', age: 29, gender: 'Female',
    bloodGroup: 'A+', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [],
    clinicalNotes: '', chiefComplaint: 'Routine check-up and cleaning.',
    status: 'new', createdAt: '2026-06-02',
    teeth: {},
  },
  {
    id: 'p4', name: 'Anand Krishnan', phone: '+91 98847 30019', age: 61, gender: 'Male',
    bloodGroup: 'AB+', hasDiabetes: true, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: ['Metformin 1000mg'],
    clinicalNotes: 'Full mouth rehab in progress. Diabetic — staged approach.',
    chiefComplaint: 'Multiple worn and missing teeth, difficulty chewing.',
    status: 'current', createdAt: '2026-02-11',
    teeth: { 14: 'crown', 46: 'scheduled', 26: 'rct', 38: 'extraction', 13: 'healthy' },
  },
];

/* ---------- procedures ---------- */
function stages(type, doneCount) {
  return PROCEDURE_STAGES[type].map((name, i) => ({
    name, completed: i < doneCount,
    date: i < doneCount ? null : null, notes: '',
  }));
}
const procedures = [
  {
    id: 'proc_rct36', treatmentPlanId: 'tp1', patientId: 'p1', type: 'RCT', tooth: 36,
    status: 'in_progress', currentStage: 'Cleaning & Shaping', stages: stages('RCT', 2),
    estimatedVisits: 4, completedVisits: 2, estimatedCost: 6000, actualCost: 3000,
    labOrderId: null, startedAt: '2026-04-18', completedAt: null,
  },
  {
    id: 'proc_crown36', treatmentPlanId: 'tp1', patientId: 'p1', type: 'Crown', tooth: 36,
    status: 'planned', currentStage: 'Tooth Preparation', stages: stages('Crown', 0),
    estimatedVisits: 2, completedVisits: 0, estimatedCost: 5000, actualCost: 0,
    labOrderId: 'lab1', startedAt: '', completedAt: null,
  },
  {
    id: 'proc_scaling', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Scaling', tooth: null,
    status: 'completed', currentStage: 'Polish', stages: stages('Scaling', 2),
    estimatedVisits: 1, completedVisits: 1, estimatedCost: 2000, actualCost: 2000,
    labOrderId: null, startedAt: '2026-05-12', completedAt: '2026-05-12',
  },
  {
    id: 'proc_crown14', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Crown', tooth: 14,
    status: 'in_progress', currentStage: 'Impression', stages: stages('Crown', 2),
    estimatedVisits: 3, completedVisits: 1, estimatedCost: 6000, actualCost: 2000,
    labOrderId: 'lab2', startedAt: '2026-05-20', completedAt: null,
  },
  {
    id: 'proc_implant46', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Implant', tooth: 46,
    status: 'planned', currentStage: 'Consultation & Planning', stages: stages('Implant', 0),
    estimatedVisits: 5, completedVisits: 0, estimatedCost: 35000, actualCost: 0,
    labOrderId: null, startedAt: '', completedAt: null,
  },
];

/* ---------- treatment plans ---------- */
const treatmentPlans = [
  { id: 'tp1', patientId: 'p1', title: 'RCT + Crown · Tooth 36', procedures: ['proc_rct36', 'proc_crown36'], totalEstimatedCost: 11000, createdAt: '2026-04-18', status: 'active' },
  { id: 'tp2', patientId: 'p4', title: 'Full Mouth Rehabilitation', procedures: ['proc_scaling', 'proc_crown14', 'proc_implant46'], totalEstimatedCost: 43000, createdAt: '2026-02-11', status: 'active' },
];

/* ---------- visits (today + history) ---------- */
const visits = [
  { id: 'v1', patientId: 'p1', procedureId: 'proc_rct36', date: TODAY, startTime: '09:30', durationMinutes: 45, status: 'arrived', visitNumber: 2, totalVisits: 4, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v2', patientId: 'p2', procedureId: null, date: TODAY, startTime: '10:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v3', patientId: 'p4', procedureId: 'proc_crown14', date: TODAY, startTime: '11:30', durationMinutes: 60, status: 'confirmed', visitNumber: 2, totalVisits: 3, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v4', patientId: 'p3', procedureId: null, date: TODAY, startTime: '16:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v5', patientId: 'p1', procedureId: 'proc_rct36', date: '2026-05-26', startTime: '10:00', durationMinutes: 45, status: 'done', visitNumber: 1, totalVisits: 4, clinicalNotes: 'Access opening done. Pulp extirpated, working length established on mesial canals.', proceduresDone: 'Access opening, pulp extirpation', nextSteps: 'Cleaning & shaping next visit. Continue ibuprofen if tender.', medications: ['Ibuprofen 400mg'] },
  /* schedule fillers across the week */
  { id: 'v6', patientId: 'p4', procedureId: 'proc_scaling', date: '2026-06-03', startTime: '09:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v7', patientId: 'p2', procedureId: null, date: '2026-06-03', startTime: '14:00', durationMinutes: 45, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v8', patientId: 'p1', procedureId: 'proc_crown36', date: '2026-06-05', startTime: '11:00', durationMinutes: 60, status: 'confirmed', visitNumber: 1, totalVisits: 2, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v9', patientId: 'p3', procedureId: null, date: '2026-06-04', startTime: '15:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
];

/* ---------- lab orders ---------- */
const labOrders = [
  { id: 'lab1', patientId: 'p1', patientName: 'Ramesh Kumar', procedureId: 'proc_crown36', procedureType: 'Crown', toothNumber: 36, labName: 'City Dental Lab', workDescription: 'PFM crown, tooth 36', sentDate: '2026-05-26', expectedReturnDate: '2026-06-02', actualReturnDate: '2026-06-01', status: 'received', costToClinic: 2500, chargedToPatient: 5000, notes: 'Standard PFM.', shade: 'A2', impressionType: 'Digital scan' },
  { id: 'lab2', patientId: 'p4', patientName: 'Anand Krishnan', procedureId: 'proc_crown14', procedureType: 'Crown', toothNumber: 14, labName: 'Precise Dental Lab', workDescription: 'Zirconia crown, tooth 14', sentDate: '2026-05-28', expectedReturnDate: '2026-06-06', actualReturnDate: null, status: 'sent', costToClinic: 3000, chargedToPatient: 6000, notes: '', shade: 'A1', impressionType: 'PVS impression' },
];

/* ---------- bills ---------- */
const bills = [
  { id: 'bill1', patientId: 'p1', patientName: 'Ramesh Kumar', items: [
      { description: 'RCT — Tooth 36 (in progress)', quantity: 1, unitPrice: 6000, total: 6000 },
      { description: 'Digital X-ray (IOPA)', quantity: 1, unitPrice: 300, total: 300 },
    ], subtotal: 6300, discount: 300, total: 6000, paid: 3000, outstanding: 3000, createdAt: '2026-05-26', status: 'partial' },
  { id: 'bill2', patientId: 'p4', patientName: 'Anand Krishnan', items: [
      { description: 'Full mouth scaling & polish', quantity: 1, unitPrice: 2000, total: 2000 },
      { description: 'Consultation', quantity: 1, unitPrice: 500, total: 500 },
    ], subtotal: 2500, discount: 0, total: 2500, paid: 2500, outstanding: 0, createdAt: '2026-05-12', status: 'paid' },
];

/* ---------- prescriptions ---------- */
const prescriptions = [
  { id: 'rx1', patientId: 'p1', patientName: 'Ramesh Kumar', date: '2026-05-26', medicines: [
      { name: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: 'BD', duration: '3 days', notes: 'After food' },
      { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: 'TDS', duration: '5 days', notes: '' },
    ], instructions: 'Take after meals. Avoid chewing on the treated side.', followUpDays: 7 },
  { id: 'rx2', patientId: 'p4', patientName: 'Anand Krishnan', date: '2026-05-12', medicines: [
      { name: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'BD', duration: '7 days', notes: 'Rinse for 30s' },
      { name: 'Paracetamol 500mg', dosage: '1 tablet', frequency: 'SOS', duration: '3 days', notes: 'If pain' },
    ], instructions: 'Warm saline rinses twice daily. Maintain blood sugar control.', followUpDays: 14 },
];

/* ---------- clinic accounts ---------- */
const clinicAccounts = [
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

/* ---------- utils ---------- */
function formatCurrency(n) {
  const v = Math.round(n || 0);
  return '\u20B9' + v.toLocaleString('en-IN');
}
function formatCurrencyK(n) {
  if (n >= 1000) return '\u20B9' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '\u20B9' + n;
}
function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function calculateAge(dob) {
  const d = new Date(dob); const now = new Date(TODAY);
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function formatDate(s) { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function formatDateLong(s) { const d = parseDate(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function formatTime(t) {
  let [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, m, ampm, label: `${h12}:${String(m).padStart(2,'0')} ${ampm}` };
}
function clinicianFlags(p) {
  const f = [];
  if (p.hasDiabetes) f.push('Diabetic');
  if (p.hasHypertension) f.push('Hypertensive');
  if (p.hasHeartCondition) f.push('Heart condition');
  if (p.isPregnant) f.push('Pregnant');
  if (p.isOnBloodThinners) f.push('Blood thinners');
  (p.allergies || []).forEach(a => f.push(a + ' allergy'));
  return f;
}
function hasComplications(p) { return clinicianFlags(p).length > 0; }

window.DATA = {
  TODAY, patients, treatmentPlans, procedures, visits, labOrders, bills, prescriptions,
  clinicAccounts, FREQUENT_MEDICINES, PROCEDURE_STAGES, PROCEDURE_TYPES,
};
Object.assign(window, {
  getProcedureColor, formatCurrency, formatCurrencyK, getInitials, calculateAge,
  formatDate, formatDateLong, formatTime, clinicianFlags, hasComplications,
  parseDate, MONTHS, DAYS, DAYS_FULL,
});
