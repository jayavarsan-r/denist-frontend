function installmentsFor(total, advance, emi) {
  const outstanding = Math.max(0, (parseFloat(total) || 0) - (parseFloat(advance) || 0));
  const per = parseFloat(emi) || 0;
  if (per <= 0 || outstanding <= 0) return 0;
  return Math.ceil(outstanding / per);
}
function advanceDueDate(dateISO, freq) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (freq === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1); // monthly default
  return d.toISOString().slice(0, 10);
}
function buildSchedule(startISO, freq, n, emi) {
  const out = [];
  let due = startISO;
  for (let i = 0; i < n; i++) {
    due = advanceDueDate(due, freq);
    out.push({ dueDate: due, amount: parseFloat(emi) || 0 });
  }
  return out;
}
module.exports = { installmentsFor, advanceDueDate, buildSchedule };
