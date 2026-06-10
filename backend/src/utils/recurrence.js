// Pure date arithmetic for recurring appointments. UTC-based to avoid TZ drift.
function buildSchedule(startDateISO, intervalDays, count) {
  const n = Math.max(0, Math.min(60, parseInt(count, 10) || 0));
  const step = parseInt(intervalDays, 10) || 1;
  const out = [];
  const base = new Date(`${startDateISO}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * step);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
module.exports = { buildSchedule };
