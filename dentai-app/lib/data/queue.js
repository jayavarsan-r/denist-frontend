/* ============================================================
   DentAI — queue + clinic-workflow data (ES module)
   Two roles: doctor + receptionist. Live queue with a state machine:
     waiting → in_consultation → ready_for_checkout → checked_out
   ============================================================ */

export const NOW_TIME = '09:42'; // reference clock for "X min waiting" labels

export const CONSULT_OUTCOMES = [
  { id: 'treatment_done', label: 'Treatment done', tone: 'green' },
  { id: 'treatment_postponed', label: 'Postponed', tone: 'amber' },
  { id: 'diagnosis_only', label: 'Diagnosis only', tone: 'teal' },
  { id: 'follow_up_scheduled', label: 'Follow-up', tone: 'teal' },
  { id: 'additional_sitting_required', label: 'More sittings', tone: 'amber' },
  { id: 'referred', label: 'Referred out', tone: 'purple' },
];

export const XRAY_TYPES = ['OPG', 'RVG', 'CBCT', 'Photo', 'Referral'];

/* meal-timing helper for prescriptions */
function slots(b, l, d) { return { breakfast: b, lunch: l, dinner: d }; }
export const mealSlots = slots;

/* ---------- helpers ---------- */
export function minutesAgo(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [nh, nm] = NOW_TIME.split(':').map(Number);
  return Math.max(0, (nh * 60 + nm) - (h * 60 + m));
}
export function waitLabel(hhmm) {
  const min = minutesAgo(hhmm);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}
export const QUEUE_STATUS = {
  waiting:            { label: 'Waiting', tone: 'neutral' },
  in_consultation:    { label: 'In consult', tone: 'amber' },
  ready_for_checkout: { label: 'Ready for checkout', tone: 'teal' },
  checked_out:        { label: 'Checked out', tone: 'green' },
};
