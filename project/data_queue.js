/* ============================================================
   DentAI — queue + clinic-workflow data (loaded after data.js)
   Two roles: doctor + receptionist. Live queue with a state machine:
     waiting → in_consultation → ready_for_checkout → checked_out
   ============================================================ */

const NOW_TIME = '09:42'; // mock clinic clock for "X min waiting"

const STAFF = {
  doctor:       { id: 's1', name: 'Dr. Arjun Mehta', role: 'doctor', initials: 'AM' },
  receptionist: { id: 's2', name: 'Lakshmi Iyer',   role: 'receptionist', initials: 'LI' },
};
const CLINIC = { name: 'Mehta Dental Care', city: 'Chennai', joinCode: 'MDC-204' };

const CONSULT_OUTCOMES = [
  { id: 'treatment_done', label: 'Treatment done', tone: 'green' },
  { id: 'treatment_postponed', label: 'Postponed', tone: 'amber' },
  { id: 'diagnosis_only', label: 'Diagnosis only', tone: 'teal' },
  { id: 'follow_up_scheduled', label: 'Follow-up', tone: 'teal' },
  { id: 'additional_sitting_required', label: 'More sittings', tone: 'amber' },
  { id: 'referred', label: 'Referred out', tone: 'purple' },
];

const XRAY_TYPES = ['OPG', 'RVG', 'CBCT', 'Photo', 'Referral'];

/* meal-timing helper for prescriptions */
function slots(b, l, d) { return { breakfast: b, lunch: l, dinner: d }; }

/* ---------- queue entries (today) ----------
   token order = arrival order. */
const queueEntries = [
  {
    id: 'q1', patientId: 'p1', tokenNumber: 1, status: 'in_consultation',
    chiefComplaint: 'Sharp pain in lower left back tooth, worse at night.',
    priority: 'normal', checkedInAt: '09:12', calledInAt: '09:30', readyAt: null,
    assignedDoctor: 's1', xrays: [{ type: 'RVG', tooth: 36 }], outcome: null, consult: null,
    transcript: '',
  },
  {
    id: 'q2', patientId: 'p2', tokenNumber: 2, status: 'ready_for_checkout',
    chiefComplaint: 'Bleeding gums while brushing for the past 3 weeks.',
    priority: 'normal', checkedInAt: '09:05', calledInAt: '09:14', readyAt: '09:34',
    assignedDoctor: 's1', xrays: [], outcome: 'treatment_done',
    transcript: 'Generalised gingivitis with heavy calculus. Did full mouth scaling today, one more sitting needed next visit. Diabetic so monitor healing. Chlorhexidine mouthwash twice daily for seven days, and paracetamol if sore.',
    consult: {
      diagnosis: 'Generalised gingivitis with sub-gingival calculus',
      procedure: 'Scaling', tooth: null, totalSittings: 2, sittingDone: 1, estimatedCost: 2000,
      medicines: [
        { name: 'Chlorhexidine Mouthwash', dose: '10 ml', frequency: 'Twice daily', duration: '7 days', timing: 'After meals', instructions: 'Rinse for 30 seconds, do not swallow.', slots: slots(true, false, true) },
        { name: 'Paracetamol', dose: '500 mg', frequency: 'As needed', duration: '3 days', timing: 'After meals', instructions: 'Take only if gums feel sore.', slots: slots(false, false, false) },
      ],
      instructions: 'Warm saline rinses twice daily. Avoid very hot or spicy food for 2 days. Keep blood sugar in check for faster healing.',
      followUp: 'Review after 2 weeks for second scaling sitting.',
      appointments: [{ session: 2, date: '2026-06-16', time: '10:00', purpose: 'Scaling — Session 2' }],
    },
  },
  {
    id: 'q3', patientId: 'p3', tokenNumber: 3, status: 'waiting',
    chiefComplaint: 'Routine check-up and cleaning.',
    priority: 'normal', checkedInAt: '09:21', calledInAt: null, readyAt: null,
    assignedDoctor: 's1', xrays: [], outcome: null, consult: null, transcript: '',
  },
  {
    id: 'q4', patientId: 'p4', tokenNumber: 4, status: 'waiting',
    chiefComplaint: 'Crown feels loose on upper right, difficulty chewing.',
    priority: 'urgent', checkedInAt: '09:38', calledInAt: null, readyAt: null,
    assignedDoctor: 's1', xrays: [{ type: 'OPG' }], outcome: null, consult: null, transcript: '',
  },
];

/* a sample completed checkout earlier today (for the "done today" strip) */
const checkoutsToday = [
  { patientName: 'Suresh Babu', procedure: 'Extraction · Tooth 48', amount: 1500, time: '08:55' },
];

/* simulated doctor dictation → extraction result, used by consult record flow */
const SAMPLE_EXTRACTION = {
  diagnosis: 'Irreversible pulpitis, tooth 36',
  procedure: 'RCT', tooth: 36, totalSittings: 4, estimatedCost: 6000,
  medicines: [
    { name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', duration: '5 days', timing: 'After meals', instructions: 'Complete the full course even if pain settles.', slots: slots(true, true, true) },
    { name: 'Ibuprofen', dose: '400 mg', frequency: 'Twice daily', duration: '3 days', timing: 'After meals', instructions: 'Take with food. Avoid on empty stomach.', slots: slots(true, false, true), uncertain: true },
  ],
  instructions: 'Avoid chewing on the treated side. Warm saline rinses from tomorrow.',
  followUp: 'Cleaning & shaping at next visit.',
  appointments: [
    { session: 2, date: '2026-06-09', time: '10:00', purpose: 'RCT — Session 2' },
    { session: 3, date: '2026-06-16', time: '10:00', purpose: 'RCT — Session 3' },
    { session: 4, date: '2026-06-23', time: '10:00', purpose: 'RCT — Session 4' },
  ],
};

/* ---------- helpers ---------- */
function minutesAgo(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [nh, nm] = NOW_TIME.split(':').map(Number);
  return Math.max(0, (nh * 60 + nm) - (h * 60 + m));
}
function waitLabel(hhmm) {
  const min = minutesAgo(hhmm);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}
const QUEUE_STATUS = {
  waiting:            { label: 'Waiting', tone: 'neutral' },
  in_consultation:    { label: 'In consult', tone: 'amber' },
  ready_for_checkout: { label: 'Ready for checkout', tone: 'teal' },
  checked_out:        { label: 'Checked out', tone: 'green' },
};

window.DATA.queueEntries = queueEntries;
window.DATA.checkoutsToday = checkoutsToday;
window.DATA.STAFF = STAFF;
window.DATA.CLINIC = CLINIC;
window.DATA.CONSULT_OUTCOMES = CONSULT_OUTCOMES;
window.DATA.XRAY_TYPES = XRAY_TYPES;
window.DATA.SAMPLE_EXTRACTION = SAMPLE_EXTRACTION;
window.DATA.NOW_TIME = NOW_TIME;
Object.assign(window, { minutesAgo, waitLabel, QUEUE_STATUS, mealSlots: slots });
