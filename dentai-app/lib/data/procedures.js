/* ============================================================
   DentAI — procedures data (ES module)
   ============================================================ */

export const PROCEDURE_STAGES = {
  RCT: ["Diagnosis & X-ray", "Access Opening", "Cleaning & Shaping", "Medication & Temporary", "Obturation", "Crown Recommendation"],
  Implant: ["Consultation & Planning", "Implant Placement", "Osseointegration", "Abutment Placement", "Crown Placement"],
  Scaling: ["Full Mouth Scaling", "Polish"],
  Extraction: ["Anesthesia & Extraction", "Socket Inspection"],
  Crown: ["Tooth Preparation", "Impression", "Temporary Crown", "Fitting & Cementation"],
};

export const PROCEDURE_TYPES = ["RCT", "Extraction", "Scaling", "Crown", "Implant", "Filling", "Orthodontics"];

/* procedure color system (block bg + border + dot) */
export const PROC_COLORS = {
  RCT:        { bg: '#EEF2FF', border: '#6366F1', dot: '#6366F1' },
  Extraction: { bg: '#FFF1F2', border: '#FF3B30', dot: '#FF3B30' },
  Scaling:    { bg: '#F0FDF4', border: '#34C759', dot: '#34C759' },
  Crown:      { bg: '#FAF5FF', border: '#BF5AF2', dot: '#BF5AF2' },
  Implant:    { bg: '#F0FDFA', border: '#32ADE6', dot: '#32ADE6' },
  Filling:    { bg: '#EFF6FF', border: '#007AFF', dot: '#007AFF' },
  Other:      { bg: '#F9FAFB', border: '#6E6E73', dot: '#6E6E73' },
};
export function getProcedureColor(type) { return PROC_COLORS[type] || PROC_COLORS.Other; }

export function currentStageIndex(proc) {
  const idx = proc.stages.findIndex((s) => !s.completed);
  return idx === -1 ? proc.stages.length - 1 : idx;
}

export const TOOTH_STATE_STYLE = {
  healthy:    { fill: '#ffffff', stroke: '#D1D1D6', sw: 1.5, num: 'var(--text-secondary)' },
  rct:        { fill: '#1C1C1E', stroke: '#1C1C1E', sw: 1.5, num: '#ffffff' },
  crown:      { fill: 'rgba(191,90,242,0.15)', stroke: '#BF5AF2', sw: 2, num: '#9333C7' },
  extraction: { fill: 'rgba(255,59,48,0.08)', stroke: '#FF3B30', sw: 1.5, num: '#FF3B30' },
  filling:    { fill: 'rgba(0,122,255,0.10)', stroke: '#007AFF', sw: 1.5, num: '#0064D2' },
  implant:    { fill: 'rgba(50,173,230,0.12)', stroke: '#32ADE6', sw: 1.5, num: '#1B86B8' },
  infection:  { fill: '#ffffff', stroke: '#D1D1D6', sw: 1.5, num: 'var(--text-secondary)', badge: true },
  scheduled:  { fill: 'rgba(255,159,10,0.10)', stroke: '#FF9F0A', sw: 1.5, num: '#C77700' },
  selected:   { fill: 'rgba(0,122,255,0.10)', stroke: '#007AFF', sw: 2, num: '#0064D2' },
};

/* internal helper — builds procedure stage arrays */
function stages(type, doneCount) {
  return PROCEDURE_STAGES[type].map((name, i) => ({
    name, completed: i < doneCount,
    date: i < doneCount ? null : null, notes: '',
  }));
}

export const procedures = [
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
export const treatmentPlans = [
  { id: 'tp1', patientId: 'p1', title: 'RCT + Crown · Tooth 36', procedures: ['proc_rct36', 'proc_crown36'], totalEstimatedCost: 11000, createdAt: '2026-04-18', status: 'active' },
  { id: 'tp2', patientId: 'p4', title: 'Full Mouth Rehabilitation', procedures: ['proc_scaling', 'proc_crown14', 'proc_implant46'], totalEstimatedCost: 43000, createdAt: '2026-02-11', status: 'active' },
];
