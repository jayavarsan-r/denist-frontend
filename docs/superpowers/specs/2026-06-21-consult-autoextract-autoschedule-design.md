# Consultation auto-extract + availability-aware auto-scheduling — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Scope:** After a consultation recording, the AI extracts the diagnosis, the
number of sittings, and the treatment amount, pre-fills them on the verification
card for the doctor to confirm/edit, and on confirm auto-schedules the next
appointment(s) onto real free slots — using the clinic's configured working
hours and days — before the patient reaches reception.

---

## Problem

The dentist dictates everything in one breath ("RCT on 36, three sittings, forty
five hundred rupees, come back next week"), but today the verification card makes
them re-type the sitting count and the cost every time, and the auto-scheduler
rarely fires.

Root causes found by tracing the live pipeline:

1. **The extraction schema has no diagnosis / total-sittings / cost fields.**
   `DraftSchema` in `backend/src/services/gemini-extraction.service.js` extracts
   `treatments`, `prescriptions`, `follow_up`, `lab_case_suggestion`,
   `clinical_notes`, `unclear_spans` — and nothing else.
2. **The frontend hardcodes the missing fields.**
   `toFrontendExtraction` in `dentai-app/lib/voice/draftMapping.js` sets
   `totalSittings: 1` and `estimatedCost: 0` literally, and maps `diagnosis` to
   `clinical_notes` (what was *done*, not the diagnosis).
3. **Because sittings defaults to 1, multi-sitting auto-scheduling never triggers.**
   `confirmConsultationDraft` already builds appointments from remaining sittings +
   follow-up, but with `total_sittings = 1` there are no remaining sittings.
4. **The slot finder ignores clinic hours.**
   `firstFreeTime` hardcodes a 10:00–18:00 window and never skips closed days,
   even though `clinics.open_time` / `close_time` / `working_days` already exist
   and are editable in Settings.
5. **The patient-profile consult path does not create clinical records.**
   It confirms via `reviewDraft` (PATCH `/api/consultation-drafts/:id`), which only
   sets status — no plan, visit, or appointments. Only the queue path runs
   `confirmConsultationDraft`.

## Goals

- AI extracts **diagnosis**, **total sittings**, and **treatment amount** from the
  transcript and pre-fills them on the verification card (doctor reviews/edits;
  never blocked if the AI is wrong).
- On confirm, the next appointment(s) auto-schedule onto **real free slots within
  the clinic's configured working hours**, skipping closed days, status `suggested`.
- Behavior is **identical for the queue consult and the patient-profile consult**.
- Working hours/days are captured at **onboarding**, editable in **Settings**, and
  picked up **immediately** by the scheduler on the next confirm (no caching).

## Non-goals

- Per-doctor calendars, holiday lists, lunch breaks, or appointment durations that
  vary by procedure. The window stays a single open→close band per clinic.
- AI originating a diagnosis. The AI captures only what the dentist *states*.
- Changing the confirm gate, the safety-net flags, or the few-shot learning loop.

---

## Design

### 1. Backend extraction — add three fields
File: `backend/src/services/gemini-extraction.service.js`

Add to **all three** in lockstep so the shape stays mirrored:
- `DraftSchema` (Zod, authoritative validator + salvage)
- `GEMINI_DRAFT_SCHEMA` (Gemini OpenAPI-subset output-shape pin)
- `SYSTEM` prompt (the JSON example + a rule line per field)

New fields (all top-level, all nullable — null when not stated, never guessed):

| Field | Type | Meaning |
|-------|------|---------|
| `diagnosis` | string \| null | The working diagnosis/condition the dentist **states**, translated to English. Distinct from `clinical_notes` (what was done). `null` if none stated. |
| `total_sittings` | int ≥ 1 \| null | Total sittings the dentist mentions ("three sittings" → 3). `null` if not mentioned. |
| `estimated_cost` | number ≥ 0 \| null | Amount the dentist **states** ("forty five hundred" → 4500), plain number, INR assumed. `null` if not stated. |

Prompt rules to add:
- diagnosis: "Capture the diagnosis the dentist states (translate to English).
  Never invent one — null if the dentist did not state a diagnosis. This is the
  condition, not the procedure performed."
- total_sittings: "If the dentist says how many total sittings the treatment needs,
  put the number here. null otherwise."
- estimated_cost: "If the dentist states a price/fee/amount, put the plain number
  here (₹ assumed). null otherwise. Do not infer from a catalog — the code does that."

Salvage: extend the salvage object in `extractFromTranscript` to carry the three
new scalars (string/number/null coercion, same pattern as `clinical_notes`).

### 2. Cost fallback — catalog × sittings
File: `backend/src/workers/voice.worker.js` (post-extraction, before persist) **or**
a small helper in the extraction service.

When `extracted.estimated_cost == null` and a treatment resolved a
`procedure_code`, compute `catalog.default_fee × (extracted.total_sittings || 1)`
using the catalog already loaded in `ctx.procedureCatalog`. Write the result onto
`extracted.estimated_cost`. Leave `null`/0 only when no catalog match exists.
This is a derived convenience value, **not** a correction — it must not be diffed
into the few-shot learning loop (only write it after the corrections baseline is
captured, i.e. it lives on `extracted`, and `computeCorrections` already compares
confirmed vs. extracted, so a fallback that the doctor accepts produces no spurious
correction as long as it is present in `extracted`).

### 3. Frontend mapping — stop hardcoding
File: `dentai-app/lib/voice/draftMapping.js`, `toFrontendExtraction`

- `diagnosis: x.diagnosis || ''` (fall back to `''`, **not** `clinical_notes`).
- `totalSittings: x.total_sittings ?? 1`
- `estimatedCost: x.estimated_cost ?? 0`
- Keep the existing `clinical_notes`-derived value available where notes are shown
  (the card currently only renders Diagnosis; clinical notes flow through
  `confirmedData.clinical_notes` unchanged via `toConfirmedData`).

`toConfirmedData` already emits `total_sittings`, `estimated_cost`, `diagnosis`
from the edited `ex` object — no change needed there beyond confirming the
round-trip (an untouched confirm must still produce zero corrections).

`ConsultReview.jsx` already renders editable Diagnosis / Sittings / Est. cost
rows — they simply start pre-filled now.

### 4. Auto-scheduling uses real clinic hours
File: `backend/src/services/transaction.service.js`

Rewrite `firstFreeTime` and the date-stepping loop in `confirmConsultationDraft`:

- **Load clinic hours once per confirm** from the `clinics` row:
  `open_time`, `close_time`, `working_days` (int[] 1–7, Mon–Sun). Fallback when
  null: open 10:00, close 18:00, working_days [1,2,3,4,5,6]. Reading fresh each
  confirm is the "auto-refresh" — a Settings change is reflected on the next consult
  with no caching.
- **Window** = `open_time` → `close_time` (minutes), 30-min aligned, skipping
  existing non-cancelled appointments and slots already picked in this same confirm.
- **Skip closed days**: a helper `nextWorkingDay(date, workingDays)` rolls a
  candidate date forward to the next day whose mapped weekday is in `working_days`.
  Map JS `getDay()` (0=Sun..6=Sat) → scheme (Sun=7, else getDay()).
- Apply `nextWorkingDay` to **each** computed sitting date (today + i×7) and to the
  follow-up date before calling the slot finder. If two specs resolve to the same
  date, the existing per-date `pickedByDate` accumulator still prevents overlap.
- Appointments still insert with `status: 'suggested'`, duration 30, and still
  schedule the WhatsApp reminders. No schema change.

### 5. Unify the profile-consult path
Files: `backend/src/controllers/voice.controller.js` (`reviewDraft`) /
`backend/src/routes/consultation-drafts.routes.js`, and the profile-consult confirm
caller in `dentai-app/app/patients/[id]/PatientProfileClient.jsx`.

- Route the patient-profile confirm through `confirmConsultationDraft` with
  `queueId = null` (the service already no-ops the queue update when `queueId` is
  falsy), so plan + visit + appointments + prescription + lab-case suggestion are
  created identically to the queue path.
- **Verify no double visit-creation**: the profile path historically created a
  visit via `POST /api/visits` (see memory: "Profile-consult save 400"). Confirm
  whether that call still fires; if the profile UI now relies on the unified
  confirm, the separate visit POST must be removed to avoid a duplicate visit.
- Keep `reviewDraft`'s reject path (status → `rejected`) intact — only the
  `confirmed` branch is redirected to the orchestrator.

### 6. Capture working hours at onboarding
File: `dentai-app/app/onboarding/page.jsx`

Add a working-hours + working-days step (open time, close time, day toggles 1–7),
defaulting to **09:00–18:00, Mon–Sat ([1,2,3,4,5,6])**. Persist via the existing
`updateClinic({ openTime, closeTime, workingDays })` call and mirror into the local
store (`updateClinicLocal`) exactly as `WorkingHoursPanel` in
`AccountSettingsSheet.jsx` already does. Reuse the same day-toggle UI pattern.

### 7. API + store
No new endpoint. `PATCH /api/clinic` already accepts `openTime`/`closeTime`/
`workingDays` (validator `clinic.validator.js` already allows them). Verify:
- The live DB has `clinics.open_time`, `close_time`, `working_days` columns
  (schema-drift note — these are already used in prod by Settings, so expected
  present; confirm before relying on them).
- `updateClinicLocal` keeps the app-store `clinic.open/close/days` in sync so the
  UI reflects a change without a reload (the scheduler reads from the DB, so it is
  correct regardless; the store sync is only for display).

---

## Data flow (after change)

```
Doctor records consult
      │
      ▼
Sarvam STT → transcript
      │
      ▼
Gemini extraction (DraftSchema)  ──►  diagnosis, total_sittings, estimated_cost,
      │                               treatments, prescriptions, follow_up, …
      ▼
cost fallback (catalog × sittings if cost null)
      │
      ▼
draft.extracted (pending_review)  ──realtime──►  Verification Card
      │                                          (Diagnosis / Sittings / Cost
      │                                           PRE-FILLED, editable)
      ▼
Doctor confirms  ──►  confirmConsultationDraft(queueId | null)
                          │
                          ├─ treatment_plan (diagnosis, total_sittings, cost)
                          ├─ visit
                          ├─ appointments  ──►  firstFreeTime() within
                          │                     clinic open→close, working days,
                          │                     status 'suggested'
                          ├─ prescription
                          └─ (queue only) queue_entry → ready_for_checkout
```

## Testing

- **Extraction (unit):** transcript with sittings + cost + diagnosis → all three
  populated; transcript with none → all three null; cost-null + catalog match →
  fallback applied; cost-null + no catalog → stays null/0.
- **Round-trip (unit):** `toFrontendExtraction` → `toConfirmedData` on an
  untouched draft produces **zero** corrections (protects the learning loop).
- **Scheduler (unit):** `nextWorkingDay` rolls Sunday→Monday when Sun closed;
  `firstFreeTime` respects open/close window and skips booked slots; sitting dates
  landing on closed days shift forward.
- **Integration:** confirm a 3-sitting consult → 2 future `suggested` appointments
  on working days within hours; profile-consult confirm creates the same records as
  the queue path with no duplicate visit.
- **Onboarding:** completing onboarding with custom hours persists to `clinics` and
  is reflected in Settings.

## Risks / caveats

- **Schema drift:** confirm `clinics` columns + that `estimated_cost`/`diagnosis`
  columns on `treatment_plans` accept the values (they are already written by the
  current confirm path).
- **Learning-loop noise:** the cost fallback must not register as a doctor
  correction. Keep the fallback on `extracted` so the diff baseline includes it.
- **Double visit:** the profile-path unification must remove any pre-existing
  `POST /api/visits` so a single confirm creates exactly one visit.
- **Prompt drift on flash-lite:** three new nullable fields are low-risk, but the
  salvage layer must default them to null so a malformed payload never breaks the
  card.
