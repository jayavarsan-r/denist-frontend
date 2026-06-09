# DentAI — Change Tracker

A complete log of changes made during this session. Grouped by area. Each entry lists the
symptom/goal, the root cause (for fixes), and the files touched. **UI/UX changes are
frontend-only; backend changes are additive and preserve existing schema, routes, and auth.**

> ⚠️ **One manual step required:** run **`backend/migrations/007_lab_and_multitooth.sql`** in
> the Supabase SQL editor (creates `lab_orders` + `treatment_teeth`). Lab, multi-tooth history,
> and consultation lab/x-ray sections depend on it. _(Already applied during this session.)_

---

## 0. Local run setup
- **Frontend:** `cd dentai-app && npm run dev` → http://localhost:3000
- **Backend:** `cd backend && PORT=4000 npm start` → http://localhost:4000 (4000 avoids the 3000 clash)
- **Frontend → backend:** `dentai-app/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`
- **Local dev login:** phone `1234567891`, OTP `123456` (pinned in `backend/.env`; no SMS in dev).

---

## 1. Connectivity & auth fixes

### 1.1 "Failed to send OTP"
- **Cause:** `NEXT_PUBLIC_API_URL` ended in `/api` while every service path also starts with `/api/...` → doubled `/api` → 404.
- **Fix:** corrected base URL (no trailing `/api`). `dentai-app/.env.local`

### 1.2 Backend deployment drift → point app at local backend
- **Cause:** the deployed backends were stale (missing `extract-*` routes, old `{success,message}` envelope). Local `backend/` is the most complete + matches the frontend's `{success,data}` envelope.
- **Fix:** `.env.local` → `http://localhost:4000`. Memory saved: `backend-deployments-drift`.

### 1.3 create-clinic 500 (`staff_dentist_id_fkey`, pgcode 23503)
- **Cause:** `verifyOtp` used `dentistId: staffRow.dentist_id || staffRow.id` — a NULL `dentist_id` put a **staff id** into the JWT, which then violated the FK on `staff` insert.
- **Fix:** login self-heal + a shared `ensureDentistId(req)` helper that guarantees a real `dentists` row before any staff insert, and returns a corrected token. `backend/src/controllers/auth.controller.js`

### 1.4 join-clinic 500 (same FK)
- **Fix:** applied the same `ensureDentistId` heal to `joinClinic`. `backend/src/controllers/auth.controller.js`

---

## 2. Voice transcription & extraction

### 2.1 Voice auto-fill filled nothing (patient registration / check-in)
- **Cause:** stale backend missing `extract-patient-info`; `CheckInSheet` silently swallowed the error.
- **Fix:** pointed to local backend (has the route); verified end-to-end.

### 2.2 Record-diagnosis filled nothing
- **Cause:** backend returns `{ structured: {...} }` with **camelCase** keys; the mapper read `raw.X` (one level too high) in **snake_case**, and there's no `diagnosis` key (it's `notes`).
- **Fix:** unwrap `structured`, read both casings, map diagnosis from `notes`, guard `medications` (a string, not array). `dentai-app/lib/hooks/useGenerateNote.js`

### 2.3 Prescription voice gaps
- **Fix:** per-med `notes` now reads `m.notes || m.instructions`; follow-up parses a day-count from `followUp` text. `dentai-app/components/sheets/PrescriptionSheet.jsx`

### 2.4 Tamil → English accuracy
- **Cause:** the consultation prompt had no translation instructions.
- **Fix:** added multilingual translation + dental-term examples; all output fields forced to English. `backend/src/services/ai/prompts/consultation.prompt.js`

### 2.5 Sarvam "Audio exceeds 30 seconds"
- **Cause:** Sarvam real-time STT caps at 30s.
- **Fix:** provider now transcodes to WAV and **chunks long audio** (≤25s segments via ffmpeg), transcribes each, joins. `backend/src/services/ai/providers/sarvam.provider.js` (requires ffmpeg — installed).

### 2.6 "Couldn't hear" on short clips / mic
- **Cause (format):** browser records **webm/opus** but provider sent it labeled `.ogg` → Sarvam returned empty. **Fix:** always transcode to WAV first (with a guessed-type fallback). `sarvam.provider.js`
- **Cause (mic):** the recorder swallowed the real `getUserMedia` failure. **Fix:** clear, specific errors (secure-origin, permission denied, no device, in-use) + live-track check. `dentai-app/lib/hooks/useAudioRecorder.js`

### 2.7 "Fix by voice" correction
- **Goal:** correct an extracted note by speaking only the change.
- **Fix:** `generate-note` accepts an optional `current` note and **merges** (only mentioned fields change); a "Fix by voice" button in the diagnosis review re-records → merges → updates in place. `backend/src/controllers/ai.controller.js`, `backend/src/services/ai/ai.service.js`, `dentai-app/lib/services/ai.service.js`, `dentai-app/lib/hooks/useGenerateNote.js`, `dentai-app/components/sheets/RecordDiagnosisSheet.jsx`

---

## 3. Operational fixes

### 3.1 Rate limit (everything 429)
- **Cause:** `rateLimit({ max: 100 / 15min })` — a single screen fans out to many calls + polling.
- **Fix:** generous default, env-overridable (`RATE_LIMIT_MAX`), effectively unlimited in dev. `backend/src/server.js`

### 3.2 Gemini quota (429 on extraction)
- **Fix:** added retry-with-backoff on 429/503 (honours `RetryInfo`) → clear `RATE_LIMITED` message; updated `GEMINI_API_KEY` to a standard-tier key. `backend/src/services/ai/providers/gemini.provider.js`, `backend/.env`

### 3.3 Completing a consult didn't move patient to checkout
- **Cause:** `completeConsultation` linked the plan but never set the queue status, so the optimistic `ready_for_checkout` was overwritten on reload.
- **Fix:** sets `status: 'ready_for_checkout'` + `consultation_outcome`. `backend/src/services/transaction.service.js`

### 3.4 Recommended appointment dates missing on checkout
- **Cause:** `followUp` was stripped by the validator; single-sitting consults created no appointment.
- **Fix:** validator accepts `followUp`; a `YYYY-MM-DD` follow-up is persisted on the visit **and** creates a "Follow-up" suggested appointment. `backend/src/validators/index.js`, `backend/src/routes/queue.routes.js`, `backend/src/services/transaction.service.js`

### 3.5 Receptionist showed wrong doctor ("With receptionist")
- **Cause:** fallback used the logged-in user's name.
- **Fix:** uses the real assigned doctor (role-checked via the queue join), else neutral "In consultation". `dentai-app/store/useQueueStore.js`, `dentai-app/app/reception/page.jsx`

---

## 4. Checkout page (was blank / broken)
- **Cause:** read `entry.consult` (ephemeral, doctor-session-only) → `return null` → blank for the receptionist. Also crashed on `entry.tokenNumber` when the queue wasn't in memory, and called `recordPayment` with ₹0.
- **Fix:**
  - New **`GET /api/queue/:id/checkout-summary`** — persisted consult data (plan, teeth, prescription, appointments) for any session. `backend/src/routes/queue.routes.js`
  - `CheckoutClient` fetches the summary (loading + "not found" states, never blank); falls back to `summary.patient`; records payment only when > 0 and links it to the plan/queue entry. `dentai-app/app/checkout/[id]/CheckoutClient.jsx`, `dentai-app/lib/services/queue.service.js`

---

## 5. Lab feature (real backend) + multi-tooth — **migration 007**
- **DB:** `lab_orders` + `treatment_teeth` tables. `backend/migrations/007_lab_and_multitooth.sql`
- **Backend:** lab repo, validators, routes (`/api/lab-orders` GET/POST/PATCH/DELETE + `/api/patients/:id/lab-orders`); multi-tooth write path (AI `toothNumbers`, `treatment_teeth` inserts); rich `/tooth-history` (per-tooth procedures w/ all teeth, lab, plans, payments); `case-sheet` extended with lab + xray path. `backend/src/repositories/index.js`, `backend/src/validators/index.js`, `backend/src/routes/lab-orders.routes.js`, `backend/src/routes/patients.routes.js`, `backend/src/services/ai/prompts/consultation.prompt.js`, `backend/src/services/transaction.service.js`, `backend/src/server.js`
- **Frontend:** `lab.service.js` (CRUD + normaliser), `useClinicalStore` wired to the API (loadLabOrders / loadPatientLabOrders / addLabOrder / markLabReceived), finance/lab + patient profile load real data. `dentai-app/lib/services/lab.service.js`, `dentai-app/store/useClinicalStore.js`, `dentai-app/app/finance/lab/page.jsx`, `dentai-app/app/patients/[id]/PatientProfileClient.jsx`

---

## 6. Patient page → treatment control center
- **Header:** live stage pill ("RCT · Teeth 36,37 · Sitting 2 of 3") from the active plan.
- **Overview rebuilt** as a control center: dominant **NEXT ACTION** (Continue treatment / Record findings), current-treatment card (sittings progress, cost, pending), central **Affected teeth** chart, next visit, previous work, per-patient tools — driven by `case-sheet`.
- **Tooth map:** decorative chips → meaningful counts; **contextual legend** (only present states); guiding empty state.
- Files: `dentai-app/app/patients/[id]/PatientProfileClient.jsx`, `dentai-app/components/sheets/ToothDetailSheet.jsx`

### 6.1 `plans.map is not a function`
- **Cause:** backend returns `{ plans: [...] }`; frontend read `treatment_plans` → fell through to the object. **Fix:** read `plans` + always coerce to array. `PatientProfileClient.jsx`

### 6.2 Delete patient (soft) — doctor & receptionist
- Service + store action + danger-zone button in the profile (confirm → soft delete → back). `dentai-app/lib/services/patient.service.js`, `dentai-app/store/usePatientStore.js`, `PatientProfileClient.jsx`

---

## 7. Odontogram (tooth chart)
- **Mobile illegible:** viewBox was 800-wide → ~0.43× scale → ~5px numbers. **Fix:** mobile-first compact canvas, then a **straight-row clinical FDI layout** (upper 18→28 / lower 48→38, numbers in the middle band) — even spacing, legible numbers/teeth.
- **Detailed teeth:** anatomical crown outlines + occlusal detail per type (molar cross-fissure, premolar groove, canine ridge, incisor edge).
- **Hover jump removed** (subtle press dim only); stronger color-coding.
- File: `dentai-app/components/odontogram/Odontogram.jsx`

---

## 8. Consultation screen (rich patient context)
- New `PatientContext` component (one `case-sheet` read): "this visit" type (**Appointment vs Consultation**, inferred from today's appointment), treatment plan + sittings + pending, **x-ray thumbnails** (tap to view), lab reports. Robust loading (request-id guard + timeout so the spinner never sticks).
- **Rename:** walk-in → **consultation** across UI.
- Files: `dentai-app/components/consultation/PatientContext.jsx`, `dentai-app/app/consultation/page.jsx`, `dentai-app/components/sheets/WalkInSheet.jsx`, `dentai-app/app/page.jsx`

---

## 9. Home pages → workflow docks (doctor + reception)
- **Paradox fixed:** Prescription/Lab/Collect had no patient → added a **patient picker** that runs first, then opens the action sheet. `dentai-app/components/sheets/PatientPickerSheet.jsx`, `dentai-app/components/SheetHost.jsx`
- **Restructure:** dominant primary action (Start/Continue consultation · Check-in) → **Quick tools** (soft full-tinted tiles) → live queue/appointments. Calm, muted, asymmetric — not saturated SaaS tiles. Lab removed from home (lives in patient/case flow).
- Files: `dentai-app/app/page.jsx`, `dentai-app/app/reception/page.jsx`

---

## 10. Schedule
- **Month calendar never showed:** the `visits.length === 0 → "No appointments"` check short-circuited all views. **Fix:** Month always renders its grid; empty state only for Day/Week. `dentai-app/app/schedule/page.jsx`

---

## 11. Scheduling intelligence (flagship) — AI parses, deterministic engine schedules
- **Architecture:** text/voice → (Sarvam STT) → Gemini **intent only** → deterministic slot finder → suggestions → **doctor confirm**. No chatbot, no auto-booking.
- **Backend:** `schedule.prompt.js` + `aiService.parseScheduleIntent` + `POST /api/ai/parse-schedule` — returns only `{ patient, procedure, preferredDate, preferredTime, notes }`, resolves relative dates, multilingual. No availability/booking logic in AI. `backend/src/services/ai/prompts/schedule.prompt.js`, `backend/src/services/ai/ai.service.js`, `backend/src/controllers/ai.controller.js`, `backend/src/routes/ai.routes.js`
- **Frontend:** calm inline smart input (type/speak) in `NewVisitSheet` that pre-fills patient/procedure/date/time-window; **procedure-aware durations**; preferred-time slot auto-pick. Existing deterministic free-slot finder + Schedule confirm preserved. `dentai-app/lib/services/ai.service.js`, `dentai-app/components/sheets/NewVisitSheet.jsx`

---

## 12. Removed unused mock data
- **Deleted 5 unused mock files:** `lib/data/{accounts,bills,lab,prescriptions,visits}.js` (zero references).
- **`patients.js`:** removed the mock `patients[]` array; kept `TODAY` + `FREQUENT_MEDICINES`.
- **`procedures.js`:** removed mock `procedures[]` + `treatmentPlans[]`; kept config + helpers (`PROCEDURE_STAGES`, `PROC_COLORS`, `getProcedureColor`, `currentStageIndex`, `TOOTH_STATE_STYLE`).
- **`queue.js`:** removed mock `STAFF`, `CLINIC`, `queueEntries[]`, `checkoutsToday[]`, `SAMPLE_EXTRACTION`; kept helpers/config (`NOW_TIME`, `CONSULT_OUTCOMES`, `XRAY_TYPES`, `mealSlots`, `minutesAgo`, `waitLabel`, `QUEUE_STATUS`).
- **Cases tab** no longer falls back to mock plans — API plans only. **STAFF** import removed from doctor home.
- Result: no screen imports a mock data array anymore; all patient/visit/plan/lab/payment/queue values come from Supabase. Only date/format/colour/pick-list **helpers & config** remain in `lib/data/`.

## 13. Calendar redesign + backend correctness
- **Schedule views rebuilt** to a premium, legible style: **Month** = navigable grid (‹/›, Today) with colour event bars per day + a **selected-day detail list** below; **Day** = time-grid timeline with ‹/› day navigation; **Week** = day-grouped agenda. All color-coded by procedure. `dentai-app/app/schedule/page.jsx`
- **Appointment detail correctness:** Day/Week/Month + the detail popup now use the appointment's real `purpose`/`tooth` (they previously looked up a procedure object in the now-empty store → everything showed "Consultation"). `app/schedule/page.jsx`, `components/sheets/ApptPeekSheet.jsx`
- **Day view was today-only** → added day navigation so future/past bookings are visible.
- **Backend calendar fixes:**
  - **`duration_minutes`** added (migration **008**) + plumbed through validator, create (crash-safe pre-migration), update, and frontend → Day blocks render true length (RCT 60, Implant 90) instead of a fixed 30. **Run `backend/migrations/008_appointment_duration.sql`.**
  - **`/api/appointments` list now excludes `cancelled`** and accepts optional `from`/`to` date-range (scales the calendar). `backend/src/controllers/appointments.controller.js`, `backend/src/validators/index.js`, `dentai-app/lib/services/appointment.service.js`

## Still recommended (not done)
- Surface a visible error in `CheckInSheet` instead of silently swallowing extraction failures.
- Throttle the aggressive `/api/queue` polling (or rely on Supabase realtime).
- Fix the post-paint "login flash" (FlowGuard redirects after first paint).
- Workflow-oriented tab rename on the patient page (Now · Cases · Chart · Scans · Record · Lab · Billing).
- Calm operational insights on the Schedule page (overdue follow-ups, overloaded periods).
- Defensive `/api` strip in `lib/api/client.js` so the base-URL gotcha can't recur.
- Rotate the Gemini key (it was shared in chat).
