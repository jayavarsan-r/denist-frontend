/* ============================================================
   DentAI — patients data (ES module)
   ============================================================ */

export const TODAY = '2026-06-02'; // Tuesday

export const FREQUENT_MEDICINES = [
  "Amoxicillin 500mg", "Ibuprofen 400mg", "Paracetamol 500mg", "Metronidazole 400mg",
  "Clindamycin 300mg", "Diclofenac 50mg", "Pantoprazole 40mg", "Cetirizine 10mg",
  "Tramadol 50mg", "Chlorhexidine Mouthwash",
];

export const patients = [
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
