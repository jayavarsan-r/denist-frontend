# Consultation Mode Rebuild — Design

**Date:** 2026-06-10
**Branch:** refactor/security-pass
**Status:** Approved (brainstorming)

## Problem

The current consultation mode (`app/consultation/page.jsx` + `RecordDiagnosisSheet.jsx`)
forces a single rigid path and isn't "doctor-first":

- The only action is **Record diagnosis**, which assumes every patient is a brand-new
  problem. Continuing-treatment visits (e.g. RCT sitting 3 of 4) have no natural path.
- The doctor **cannot independently call in a patient** — the empty-chair button only
  calls `waiting[0]`, and while a patient is in the chair the waiting list is
  display-only (cannot swap).
- The consult is a **modal sheet**, not a persistent operational surface, and its
  working state lives as `useState` inside the sheet, so it dies on close and can't
  survive a swap or be hand-edited.
- The review screen is **read-only** (only "Fix by voice" / "Re-record"); if Sarvam
  fails (the 30s-limit error) or the AI is wrong, the consult can't be completed.
- Completing a consult does an **optimistic double-transition** (current →
  ready_for_checkout AND next waiting → in_consultation in one set), a cause of the
  "previous patient flashes" instability.

## Decisions (locked)

1. **Philosophy A — voice-first capture, refined.** Voice stays the spine; we add
   manual escape hatches and let the doctor choose who to call in.
2. **One voice path, AI decides.** The doctor always records; the AI detects whether
   it's a new diagnosis or a continuation and advances the existing plan accordingly.
3. **Auto-pull next FIFO, interruptible.** After completing, the next FIFO patient
   auto-loads, but any waiting patient can be swapped in.
4. **Voice + tap-to-edit.** Every review field is editable by hand; the consult can be
   completed without voice. Medicines default **empty** unless explicitly extracted.

## Architecture (Approach 1 — inline surface + draft store)

### New: `store/useConsultStore.js`
Holds per-entry drafts so consult state survives swaps and is hand-editable.

```
drafts: { [queueEntryId]: {
  phase: 'idle'|'recording'|'processing'|'review',
  transcript: string,
  extraction: { diagnosis, procedure, tooth/teeth, totalSittings, sittingNumber,
                isContinuation, estimatedCost, followUp, medicines:[], appointments:[] },
  chunks: { captured:int, total:int, transcribed:int },  // long-recording progress
  error: string|null,
} }
```
Actions: `getDraft(id)`, `setPhase(id,phase)`, `setExtraction(id,patch)`,
`editField(id,key,value)`, `addMedicine(id)/editMedicine(id,i,patch)/removeMedicine(id,i)`,
`resetDraft(id)`.

### Inline surface — `app/consultation/page.jsx`
The consult renders **inline on the page** (no modal for the main flow), driven by the
active entry's draft `phase`:
- **idle**: patient card (tap → profile) + `PatientContext` + dark **Record** button +
  "or fill in manually" + swap-able waiting queue (each waiting row has "Call in").
- **recording / processing**: voice UI consistent with `VoiceSheet` (dark accent
  waveform, blue "Stop" link, tabular timer, "Understanding…" dots) + chunk progress.
- **review**: editable field card + "Fix by voice" + "+ add medicine" + **Complete
  consult**.

The recording/transcription/AI logic is lifted out of `RecordDiagnosisSheet` and reused.
The sheet is retired from the consult flow (kept only if referenced elsewhere).

### Audio chunking — `lib/hooks/useChunkedTranscription.js` (or wrap existing)
Wrap `useAudioRecorder` + `useTranscription` so recordings auto-split into ≤30s
segments, transcribed sequentially and concatenated. Surfaces `{captured,total,
transcribed}` for the progress indicator. Eliminates the Sarvam 400 at the source.

### Editable fields
Each review field is a tap-to-edit control writing back to the draft via `editField`.
Medicines list starts empty and only fills from explicit extraction (never hallucinated).

## Edge cases

- **Swap**: tapping a waiting patient's "Call in" while one is in the chair returns the
  current entry to `waiting` (its draft retained by entry id) and calls in the chosen
  one. No data loss.
- **Complete**: `completeConsult` marks the entry `ready_for_checkout`, then *separately*
  auto-pulls the next FIFO into the chair — one clean transition, no flash. Checkout /
  billing remains the receptionist's flow (unchanged).
- **Voice failure** (empty transcript / network / Sarvam): stay in `review` with whatever
  exists; doctor edits manually. Never a dead-end error screen.
- **Continuation detection wrong**: the "Sitting N of M / continuing" field is editable,
  so the doctor can correct new-vs-continuation before completing.

## Out of scope (separate backlog items)
Prescription-extraction AI quality (beyond defaulting empty), checkout/queue rendering
bugs on the checkout screen, appointment voice workflow, tooth-chart default-coloring.
The empty-medicines default is included here because it lives on this surface.

## Testing
- `useConsultStore` reducers (draft lifecycle, edit/add/remove medicine, swap retention).
- Chunking util: splits >30s into ≤30s segments, concatenates transcripts, reports progress.
- Completion: marks ready_for_checkout + single next-pull (no double-transition), draft cleared.
- Manual verification in-app: record long (>30s) note, edit a field, swap patients mid-draft,
  complete, confirm clean handoff.
```
