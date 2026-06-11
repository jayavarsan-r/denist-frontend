/* Appointment slot finder
   Finds free time slots on a given date based on clinic sessions and existing visits.
   Returns slots in 30-min increments; if the requested date is full, walks forward
   up to maxDaysAhead to find the next available date.
*/

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function formatLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Returns array of { time: 'HH:MM', endTime: 'HH:MM', label: '9:30 AM' } for a specific date */
export function findFreeSlots(dateStr, visits, clinic, durationMins = 30) {
  // Check if this weekday is open
  const dow = new Date(dateStr + 'T00:00:00').getDay(); // local weekday
  const days = clinic.sessions ? (clinic.days || [0, 1, 2, 3, 4, 5, 6]) : (clinic.days || [1, 2, 3, 4, 5, 6]);
  if (!days.includes(dow)) return [];

  const sessions = clinic.sessions?.length
    ? clinic.sessions
    : [{ open: clinic.open || '09:00', close: clinic.close || '18:00' }];

  // Booked intervals for this date (ignore no-shows)
  const booked = visits
    .filter(v => v.date === dateStr && v.status !== 'no_show')
    .map(v => ({
      start: toMins(v.startTime),
      end: toMins(v.startTime) + (v.durationMinutes || 30),
    }));

  // Don't offer times that have already passed today (e.g. it's 4:50 PM → the 9 AM
  // slot is not bookable). A 5-min lead time avoids offering the slot you're standing in.
  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const earliest = isToday ? now.getHours() * 60 + now.getMinutes() + 5 : -1;

  const free = [];
  const STEP = 30; // generate candidates every 30 min

  for (const sess of sessions) {
    const sessStart = toMins(sess.open);
    const sessEnd = toMins(sess.close);
    for (let t = sessStart; t + durationMins <= sessEnd; t += STEP) {
      if (t < earliest) continue; // already in the past today
      const end = t + durationMins;
      const clash = booked.some(b => t < b.end && end > b.start);
      if (!clash) {
        free.push({ time: toHHMM(t), endTime: toHHMM(end), label: formatLabel(toHHMM(t)) });
      }
    }
  }

  return free;
}

/** Walks forward from dateStr to find the next date that has at least one free slot.
    Returns { date, slots, daysAhead } or null if nothing found within maxDays. */
export function findNextAvailable(dateStr, visits, clinic, durationMins = 30, maxDays = 14) {
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const next = d.toISOString().slice(0, 10);
    const slots = findFreeSlots(next, visits, clinic, durationMins);
    if (slots.length > 0) return { date: next, slots, daysAhead: i };
  }
  return null;
}

/** Short human-readable date label like "Wed, Jun 11" */
export function friendlyDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}
