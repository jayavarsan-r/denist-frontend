/* ============================================================
   DentAI — utility functions (ES module)
   ============================================================ */

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DAYS_FULL = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

const GREETINGS = {
  earlyMorning: [ // 5–9
    'Rise and shine,',
    'Early bird,',
    'Good morning,',
    'Morning, doc —',
  ],
  morning: [ // 9–12
    'Good morning,',
    'Morning,',
    'Great to see you,',
    'Ready for the day,',
    'Hope your morning is going well,',
  ],
  afternoon: [ // 12–17
    'Good afternoon,',
    'Afternoon,',
    'Hope lunch was good,',
    'Halfway through,',
    'Keep it up,',
    'Good to have you back,',
  ],
  evening: [ // 17–20
    'Good evening,',
    'Evening,',
    'Winding down,',
    'Great work today,',
    'Almost there,',
  ],
  night: [ // 20+
    'Working late,',
    'Burning the midnight oil,',
    'Good night,',
    'Rest well after this,',
  ],
};

export function getGreeting() {
  const h = new Date().getHours();
  let pool;
  if (h >= 5 && h < 9)        pool = GREETINGS.earlyMorning;
  else if (h >= 9 && h < 12)  pool = GREETINGS.morning;
  else if (h >= 12 && h < 17) pool = GREETINGS.afternoon;
  else if (h >= 17 && h < 20) pool = GREETINGS.evening;
  else                         pool = GREETINGS.night;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
export function formatDate(s) { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function formatDateLong(s) { const d = parseDate(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function formatTime(t) {
  if (!t) return { h12: 12, m: 0, ampm: 'AM', label: '--:--' };
  let [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, m, ampm, label: `${h12}:${String(m).padStart(2,'0')} ${ampm}` };
}
export function formatCurrency(n) {
  const v = Math.round(n || 0);
  return '₹' + v.toLocaleString('en-IN');
}
export function formatCurrencyK(n) {
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + n;
}
export function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
export function calculateAge(dob) {
  const TODAY = '2026-06-02';
  const d = new Date(dob); const now = new Date(TODAY);
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
export function clinicianFlags(p) {
  const f = [];
  if (p.hasDiabetes) f.push('Diabetic');
  if (p.hasHypertension) f.push('Hypertensive');
  if (p.hasHeartCondition) f.push('Heart condition');
  if (p.isPregnant) f.push('Pregnant');
  if (p.isOnBloodThinners) f.push('Blood thinners');
  (p.allergies || []).forEach(a => f.push(a + ' allergy'));
  return f;
}
export function hasComplications(p) { return clinicianFlags(p).length > 0; }
