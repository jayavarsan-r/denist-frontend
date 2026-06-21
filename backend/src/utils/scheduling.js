// Pure scheduling helpers — no DB, no env. Clinic working-hours + free-slot math.
// working_days is an int array; Sunday is accepted as BOTH 0 and 7 because the
// onboarding UI historically stored Sunday as 0 while Settings stores it as 7.

const toMin = (hhmm) => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function isWorkingDay(date, workingDays) {
  const set = new Set((workingDays || []).map(Number));
  if (!set.size) return true;
  const js = date.getDay(); // 0=Sun..6=Sat
  const cands = js === 0 ? [0, 7] : [js];
  return cands.some((d) => set.has(d));
}

// Roll `date` forward (up to 14 days) to the next working day. Returns a new Date.
function nextWorkingDay(date, workingDays) {
  const d = new Date(date);
  for (let i = 0; i < 14; i++) {
    if (isWorkingDay(d, workingDays)) return d;
    d.setDate(d.getDate() + 1);
  }
  return new Date(date);
}

// First free 30-min-aligned start minute in [openMin, closeMin) that doesn't clash
// with bookedRanges ([startMin, endMin]) or alreadyPickedMins. Falls back to openMin.
function pickSlot(bookedRanges, openMin, closeMin, durationMins = 30, alreadyPickedMins = []) {
  const booked = [
    ...(bookedRanges || []),
    ...(alreadyPickedMins || []).map((s) => [s, s + durationMins]),
  ];
  for (let t = openMin; t + durationMins <= closeMin; t += 30) {
    const clash = booked.some(([s, e]) => t < e && t + durationMins > s);
    if (!clash) return t;
  }
  return openMin;
}

module.exports = { toMin, toHHMM, isWorkingDay, nextWorkingDay, pickSlot };
