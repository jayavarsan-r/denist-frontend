function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function overlaps(aStart, aDur, bStart, bDur) {
  const a = toMinutes(aStart), b = toMinutes(bStart);
  if (a == null || b == null) return false;
  const aEnd = a + (parseInt(aDur, 10) || 30);
  const bEnd = b + (parseInt(bDur, 10) || 30);
  return a < bEnd && b < aEnd;
}
module.exports = { toMinutes, overlaps };
