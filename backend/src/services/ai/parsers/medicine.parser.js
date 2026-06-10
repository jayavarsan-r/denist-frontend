// Single source of truth for medicine shape. Historically two incompatible
// schemas existed (ai.controller used `dosage`/`notes`; ai.service used
// `dose`/`timing`/`meal_timing_slots`). EVERY path that reads or writes medicines
// now goes through normalize() so the dual-schema problem cannot recur.
//
// Canonical object carries BOTH the PDF-critical fields (dose, timing,
// meal_timing_slots) and the architecture-spec aliases (strength, mealTiming):
//   { name, dose, strength, frequency, duration, timing, mealTiming,
//     meal_timing_slots, instructions, uncertain }

function deriveSlots(timing, frequency) {
  const t = (timing || '').toLowerCase();
  const f = (frequency || '').toLowerCase();
  if (t.includes('bedtime') || t.includes('night') || f.includes('night')) {
    return { breakfast: false, lunch: false, dinner: true };
  }
  if (f.includes('three') || f.includes('tds') || f.includes('3x') || f.includes('thrice')) {
    return { breakfast: true, lunch: true, dinner: true };
  }
  if (f.includes('twice') || f.includes('bd') || f.includes('2x')) {
    return { breakfast: true, lunch: false, dinner: true };
  }
  return { breakfast: true, lunch: false, dinner: false };
}

function normalize(med = {}) {
  const dose = med.dose || med.dosage || med.strength || '';
  const timing = med.timing || med.mealTiming || '';
  const frequency = med.frequency || '';
  const instructions = med.instructions || med.notes || '';
  const slots = med.meal_timing_slots || deriveSlots(timing, frequency);
  return {
    name: med.name || '',
    dose,
    dosage: dose,   // PrescriptionSheet reads `dosage`
    strength: dose, // architecture-spec alias
    frequency,
    duration: med.duration || '',
    timing,
    mealTiming: timing, // spec alias
    meal_timing_slots: slots,
    instructions,
    uncertain: !!med.uncertain,
  };
}

function normalizeList(meds) {
  return (Array.isArray(meds) ? meds : []).map(normalize);
}

module.exports = { normalize, normalizeList, deriveSlots };
