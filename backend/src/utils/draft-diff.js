// Corrections = what the doctor changed on the Verification Card vs what the AI
// extracted. Stored on the draft row and injected as few-shots into future
// prompts for the same doctor (the learning loop — no vectors).

const CANONICAL_FIELDS = ['treatments', 'prescriptions', 'follow_up', 'lab_case_suggestion', 'clinical_notes'];

// Strip the worker's resolution decorations before comparing prescriptions —
// they are derived data, not something the doctor "corrected".
function stripDerived(value) {
  if (Array.isArray(value)) return value.map(stripDerived);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('resolved_') || k === 'resolution_confident' || k === 'price_per_unit' || k === 'stock_qty') continue;
      out[k] = stripDerived(v);
    }
    return out;
  }
  return value;
}

function computeCorrections(aiExtracted, doctorConfirmed) {
  const corrections = {};
  for (const field of CANONICAL_FIELDS) {
    const aiVal = stripDerived(aiExtracted?.[field] ?? null);
    const docVal = stripDerived(doctorConfirmed?.[field] ?? null);
    if (JSON.stringify(aiVal) !== JSON.stringify(docVal)) {
      corrections[field] = { ai_said: aiVal, doctor_said: docVal };
    }
  }
  return corrections;
}

module.exports = { computeCorrections, CANONICAL_FIELDS };
