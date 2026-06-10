// Pure UHID helpers. DB sequence/collision handling lives in the controller.
function clinicPrefix(clinic = {}) {
  const fromName = String(clinic.name || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (fromName) return fromName.slice(0, 3);
  const fromDisplay = String(clinic.display_id || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (fromDisplay) return fromDisplay.slice(0, 4);
  return 'PAT';
}
function formatUhid(prefix, seq) {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}
module.exports = { clinicPrefix, formatUhid };
