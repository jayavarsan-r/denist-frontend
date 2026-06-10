import { create } from 'zustand';
import {
  emptyDraft,
  blankExtraction,
  normaliseExtraction,
  withField,
  withAddedMedicine,
  withEditedMedicine,
  withRemovedMedicine,
} from './consultDraft.mjs';

/**
 * useConsultStore — per-queue-entry consultation drafts.
 *
 * The doctor's in-progress consult (recording phase, transcript, editable
 * extraction) lives here keyed by queue-entry id, NOT inside a modal's local
 * state. That's what lets the review be hand-edited and survive swapping to
 * another patient mid-consult without losing work. Pure draft transforms are in
 * consultDraft.mjs (node-tested); this is the thin zustand wrapper.
 */
export const useConsultStore = create((set, get) => ({
  drafts: {},

  /* ─── Reads ─── */
  getDraft: (id) => get().drafts[id] || null,

  /* ─── Lifecycle ─── */
  ensureDraft: (id) =>
    set((s) => (s.drafts[id] ? s : { drafts: { ...s.drafts, [id]: emptyDraft() } })),

  setPhase: (id, phase) => set((s) => ({ drafts: patchDraft(s.drafts, id, { phase }) })),

  setTranscript: (id, transcript) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { transcript }) })),

  setError: (id, error) => set((s) => ({ drafts: patchDraft(s.drafts, id, { error }) })),

  // Set the full extraction (from a fresh recording). Medicines never fabricated.
  setExtraction: (id, extraction) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { extraction: normaliseExtraction(extraction) }) })),

  // Merge a partial extraction (fix-by-voice changes only the fields it mentions).
  mergeExtraction: (id, partial) =>
    set((s) => {
      const cur = s.drafts[id]?.extraction || {};
      return { drafts: patchDraft(s.drafts, id, { extraction: { ...cur, ...partial } }) };
    }),

  // Start a consult with no recording — blank, hand-fillable.
  startManual: (id) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { phase: 'review', extraction: blankExtraction() }) })),

  /* ─── Field-level edits (review screen) ─── */
  editField: (id, key, value) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { extraction: withField(s.drafts[id]?.extraction, key, value) }) })),

  addMedicine: (id) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { extraction: withAddedMedicine(s.drafts[id]?.extraction) }) })),

  editMedicine: (id, index, patch) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { extraction: withEditedMedicine(s.drafts[id]?.extraction, index, patch) }) })),

  removeMedicine: (id, index) =>
    set((s) => ({ drafts: patchDraft(s.drafts, id, { extraction: withRemovedMedicine(s.drafts[id]?.extraction, index) }) })),

  /* ─── Clear (after completing) ─── */
  resetDraft: (id) =>
    set((s) => {
      if (!s.drafts[id]) return s;
      const next = { ...s.drafts };
      delete next[id];
      return { drafts: next };
    }),
}));

function patchDraft(drafts, id, patch) {
  const cur = drafts[id] || emptyDraft();
  return { ...drafts, [id]: { ...cur, ...patch } };
}
