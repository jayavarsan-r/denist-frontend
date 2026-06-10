// Pure, framework-free logic for a consultation draft.
//
// A "draft" is the doctor's in-progress work on one queue entry: the recording
// phase, the transcript, and the structured extraction (diagnosis / procedure /
// medicines / next visit) that the doctor can edit by hand. Keeping this logic
// pure (no zustand, no React) makes it node-testable and lets useConsultStore
// stay a thin wrapper. See consultDraft.test.mjs.

/** A fresh, untouched draft for a queue entry. */
export function emptyDraft() {
  return { phase: 'idle', transcript: '', extraction: null, error: null };
}

/** A blank extraction for "skip voice, fill manually". Empty everything, one sitting, NO medicines. */
export function blankExtraction() {
  return {
    diagnosis: '',
    procedure: '',
    tooth: null,
    teeth: [],
    totalSittings: 1,
    sittingNumber: null,
    isContinuation: false,
    estimatedCost: 0,
    followUp: '',
    medicines: [],
    appointments: [],
  };
}

// Guarantee from the product brief: the AI must NEVER hallucinate medicines.
// An extraction with no medicines yields an empty list — never a fabricated one.
export function normaliseExtraction(ex) {
  if (!ex) return null;
  return { ...ex, medicines: Array.isArray(ex.medicines) ? ex.medicines : [] };
}

/** Immutably set one field on an extraction. */
export function withField(extraction, key, value) {
  return { ...(extraction || {}), [key]: value };
}

/** Append a new empty, editable medicine. */
export function withAddedMedicine(extraction) {
  const meds = Array.isArray(extraction?.medicines) ? extraction.medicines : [];
  const blank = { name: '', dose: '', frequency: '', duration: '', slots: {}, uncertain: false };
  return { ...(extraction || {}), medicines: [...meds, blank] };
}

/** Merge a patch onto the medicine at `index`. */
export function withEditedMedicine(extraction, index, patch) {
  const meds = (extraction?.medicines || []).map((m, i) => (i === index ? { ...m, ...patch } : m));
  return { ...(extraction || {}), medicines: meds };
}

/** Remove the medicine at `index`. */
export function withRemovedMedicine(extraction, index) {
  const meds = (extraction?.medicines || []).filter((_, i) => i !== index);
  return { ...(extraction || {}), medicines: meds };
}
