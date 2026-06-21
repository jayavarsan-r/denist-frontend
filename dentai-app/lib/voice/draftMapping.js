/**
 * Mapping between a consultation_draft's `extracted` object (the backend
 * DraftSchema shape) and the frontend extraction shape ConsultReview edits.
 *
 * The two functions are inverses on the canonical fields when the doctor edits
 * nothing — that's what keeps the backend's corrections diff clean (an untouched
 * confirm must produce ZERO corrections, or the few-shot learning loop would
 * learn noise).
 */

const parseDays = (text) => {
  if (text == null || text === '') return null;
  if (typeof text === 'number') return text > 0 ? Math.round(text) : null;
  const s = String(text).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const days = Math.round((new Date(s.slice(0, 10)) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
    return days > 0 ? days : null;
  }
  const m = s.match(/\d+/);
  return m ? (parseInt(m[0], 10) || null) : null;
};

/** draft row → the `ex` object ConsultReview renders/edits */
export function toFrontendExtraction(draft) {
  const x = draft?.extracted || {};
  const treatments = Array.isArray(x.treatments) ? x.treatments : [];
  const primary = treatments[0] || {};
  const teeth = [...new Set(treatments.map((t) => t.tooth_fdi).filter((t) => t != null).map(String))];

  const medicines = (Array.isArray(x.prescriptions) ? x.prescriptions : []).map((rx) => ({
    // name stays the SPOKEN span so an untouched confirm round-trips exactly;
    // the resolved inventory name/price render as secondary info.
    name: rx.medicine_name_span || '',
    dose: rx.dose || '',
    frequency: rx.frequency || '',
    duration: rx.duration_days ? `${rx.duration_days} days` : '',
    instructions: rx.instructions || '',
    slots: {},
    uncertain: rx.resolution_confident === false,
    resolvedName: rx.resolved_name && rx.resolved_name !== rx.medicine_name_span ? rx.resolved_name : null,
    resolvedStrength: rx.resolved_strength || null,
    price: rx.price_per_unit ?? null,
    stock: rx.stock_qty ?? null,
    lowThreshold: rx.low_stock_threshold ?? null,
    _rx: rx, // original entry — resolution fields survive an untouched confirm
  }));

  return {
    diagnosis: x.diagnosis || '',
    procedure: primary.procedure_name_span || '',
    tooth: teeth[0] ? Number(teeth[0]) : null,
    teeth,
    totalSittings: x.total_sittings ?? 1,
    estimatedCost: x.estimated_cost ?? 0,
    medicines,
    instructions: '',
    followUp: x.follow_up?.in_days ? `${x.follow_up.in_days} days` : '',
    followUpReason: x.follow_up?.reason || null,
    appointments: [],
    safetyFlags: draft?.safety_flags || [],
    unclearSpans: x.unclear_spans || [],
    lowConfidence: draft?.low_confidence || [],
    transcript: draft?.raw_transcript || '',
    _extracted: x,
    _draftId: draft?.id || null,
  };
}

/** edited `ex` → confirmed_data for POST complete-consult / PATCH draft */
export function toConfirmedData(ex) {
  const base = Array.isArray(ex._extracted?.treatments) ? ex._extracted.treatments : [];
  const teeth = Array.isArray(ex.teeth) && ex.teeth.length
    ? ex.teeth
    : (ex.tooth != null ? [String(ex.tooth)] : []);

  let treatments;
  if (teeth.length) {
    treatments = teeth.map((tooth, i) => ({
      procedure_name_span: ex.procedure || base[i]?.procedure_name_span || null,
      procedure_code: (ex.procedure && base[i] && ex.procedure !== base[i].procedure_name_span) ? null : (base[i]?.procedure_code ?? null),
      tooth_fdi: parseInt(tooth, 10) || null,
      sitting_action: base[i]?.sitting_action ?? base[0]?.sitting_action ?? null,
      sitting_number: base[i]?.sitting_number ?? null,
      notes: base[i]?.notes ?? null,
    }));
  } else if (ex.procedure) {
    treatments = [{
      procedure_name_span: ex.procedure,
      procedure_code: base[0]?.procedure_code ?? null,
      tooth_fdi: null,
      sitting_action: base[0]?.sitting_action ?? null,
      sitting_number: base[0]?.sitting_number ?? null,
      notes: base[0]?.notes ?? null,
    }];
  } else {
    treatments = [];
  }

  const prescriptions = (ex.medicines || []).map((m) => {
    const orig = m._rx || {};
    const nameUnchanged = m.name === orig.medicine_name_span;
    return {
      medicine_name_span: m.name || '',
      dose: m.dose || null,
      frequency: m.frequency || null,
      duration_days: parseDays(m.duration),
      instructions: m.instructions || null,
      // resolution survives only while the name the doctor confirmed is the one
      // that was resolved — an edited name invalidates the inventory match.
      resolved_item_id: nameUnchanged ? (orig.resolved_item_id ?? null) : null,
      resolved_name: nameUnchanged ? (orig.resolved_name ?? m.name) : m.name,
      resolved_strength: nameUnchanged ? (orig.resolved_strength ?? null) : null,
      price_per_unit: nameUnchanged ? (orig.price_per_unit ?? null) : null,
      stock_qty: nameUnchanged ? (orig.stock_qty ?? null) : null,
      resolution_confident: nameUnchanged ? (orig.resolution_confident ?? false) : false,
    };
  });

  const inDays = parseDays(ex.followUp);
  return {
    treatments,
    prescriptions,
    follow_up: inDays ? { in_days: inDays, reason: ex.followUpReason || null } : null,
    lab_case_suggestion: ex._extracted?.lab_case_suggestion ?? null,
    clinical_notes: ex.diagnosis || null,
    total_sittings: parseInt(ex.totalSittings, 10) || 1,
    estimated_cost: parseFloat(ex.estimatedCost) || 0,
    diagnosis: ex.diagnosis || null,
  };
}
