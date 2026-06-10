# DentAI Production Hardening — Design

**Date:** 2026-06-10
**Branch:** refactor/security-pass
**Source:** Closes every item in `dentai_test_report.md` (52-test E2E QA run: 36 pass / 3 fail / 11 missing)
**Scope decision:** Full close-out of the report — all fixes, all missing endpoints, including EMI/payment-plans and notifications (provider-agnostic). Backend + minimal frontend wiring. No external service credentials required to ship.

---

## 1. Goals & Non-Goals

### Goals
- Fix the 3 hard failures: overpayment guard, appointment conflict detection, complete-consult `patientId` requirement.
- Close the critical blockers: UHID generation, finance data on dashboards.
- Build all missing endpoints: 3 role dashboards, tooth-chart write, recurring appointments, EMI/payment-plans, notifications (4 convenience routes + generic).
- Add structured storage for implant metadata, guardians, per-tooth status.
- Make API field names/enums coherent and documented.
- Wire the new data into existing frontend screens (no brand-new screens).

### Non-Goals
- No real WhatsApp/SMS provider integration — a stub adapter behind a provider interface only. The user supplies a provider later via config.
- No new frontend screens (notifications log viewer, EMI tracker UI, etc.) beyond wiring into existing surfaces.
- No RLS / auth model changes. No change to the `{success,data}` response envelope or auth middleware.

---

## 2. Context & Constraints

- **Stack:** Node/Express backend (Supabase JS client, no ORM), Next.js 16 frontend (Zustand stores, per-domain services).
- **Response envelope:** A middleware wraps handler output as `{ success, data }` (errors as `{ success:false, error:{code,message,details} }`). All new endpoints return bare shapes (`{ patient }`, `{ plan }`, …) and rely on the wrapper — consistent with current handlers.
- **Validation:** `validate(zodSchema)` middleware on every mutating route; schemas live in `src/validators/index.js`.
- **Orchestration:** Multi-table writes live in `src/services/transaction.service.js`, each ending with an `audit.log(...)`. New multi-table flows follow this pattern.
- **Schema drift is real but the live DB is current.** Verified live via the Supabase REST API on 2026-06-10:
  - Present live: `lab_orders`, `treatment_teeth`, `audit_logs`, `appointments.duration_minutes`, `treatment_plans.collected_amount` + `pending_amount`, patients soft-delete columns.
  - **Confirmed missing live:** `patients.uhid`, `patients.guardian_name`, `patients.guardian_phone`, `treatment_plans.metadata`, `tooth_chart`, `payment_plans`, `notification_logs`.
  - `treatment_plans.pending_amount` may be GENERATED or plain on a given deployment; `recordPayment` already writes-then-retries-without it. New code must preserve that behaviour — never hard-depend on writing `pending_amount`.
- **All migrations are idempotent** (`if not exists` / `add column if not exists`) and hand-run in the Supabase SQL editor; the app never auto-migrates.

---

## 3. Schema Changes — `backend/migrations/010_qa_hardening.sql`

One idempotent migration. Safe to re-run.

### 3.1 patients — UHID + guardian
```sql
alter table public.patients add column if not exists uhid           text;
alter table public.patients add column if not exists guardian_name  text;
alter table public.patients add column if not exists guardian_phone text;
-- UHID is unique within a clinic, not globally (two clinics can both have VEL-0001).
create unique index if not exists patients_clinic_uhid_uniq
  on public.patients (clinic_id, uhid) where uhid is not null;
```
**Backfill** existing patients without a UHID: assign per-clinic sequential UHIDs ordered by `created_at`. Done by a one-off node script `scripts/backfill_uhid.mjs` (idempotent: only fills `uhid is null` rows), not in the SQL migration, so it can reuse the same generation helper as the app.

### 3.2 treatment_plans — structured metadata
```sql
alter table public.treatment_plans add column if not exists metadata jsonb not null default '{}'::jsonb;
```
Shape (free-form, documented):
```json
{ "implant": { "brand": "Straumann", "size": "4.2x10mm", "lot": "ST-88392" },
  "stages": [ { "stage": 1, "description": "CBCT", "done": false }, ... ] }
```
**Rationale:** implant fields apply to one procedure type among many — dedicated columns would bloat every row. jsonb is queryable in Postgres and future-proof.

### 3.3 tooth_chart — current per-tooth status
```sql
create table if not exists public.tooth_chart (
  id           uuid primary key default uuid_generate_v4(),
  clinic_id    uuid references public.clinics(id)  on delete cascade,
  patient_id   uuid references public.patients(id) on delete cascade,
  tooth_number text not null,                 -- FDI, e.g. '36'
  conditions   jsonb not null default '[]',   -- ["infection","rct_initiated","temporary_restoration"]
  surfaces     jsonb,                          -- optional, e.g. {"mesial":true}
  notes        text,
  updated_by   uuid references public.staff(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (clinic_id, patient_id, tooth_number)
);
create index if not exists tooth_chart_patient_idx on public.tooth_chart (clinic_id, patient_id);
```
**Rationale:** `treatment_teeth` is a procedure *link* (many rows per tooth over time). The chart is *current state* (exactly one row per tooth). Different cardinality and lifecycle → separate table. `conditions` is an enum-validated string array.

**Allowed condition values** (validated in app): `healthy, caries, infection, rct_initiated, rct_completed, temporary_restoration, permanent_restoration, crown, missing, implant, extraction_advised, mobility`.

### 3.4 payment_plans — EMI
```sql
create table if not exists public.payment_plans (
  id                uuid primary key default uuid_generate_v4(),
  clinic_id         uuid references public.clinics(id)          on delete cascade,
  patient_id        uuid references public.patients(id)         on delete cascade,
  treatment_plan_id uuid references public.treatment_plans(id)  on delete set null,
  total_amount      numeric(10,2) not null default 0,
  advance_paid      numeric(10,2) not null default 0,
  emi_amount        numeric(10,2) not null default 0,
  emi_frequency     text not null default 'monthly',  -- monthly|weekly|biweekly
  installments_total int not null default 0,
  next_due_date     date,
  status            text not null default 'active',    -- active|completed|defaulted|cancelled
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index if not exists payment_plans_patient_idx on public.payment_plans (clinic_id, patient_id);
create index if not exists payment_plans_plan_idx    on public.payment_plans (treatment_plan_id);
```
`installments_total` is derived from `(total_amount − advance_paid) / emi_amount` (ceil) by the `emi.mjs` helper at create time; `next_due_date` advances as payments land. Existing `payments` rows remain the source of truth for *collected* amounts; `payment_plans` is the *schedule*.

### 3.5 notification_logs
```sql
create table if not exists public.notification_logs (
  id                  uuid primary key default uuid_generate_v4(),
  clinic_id           uuid references public.clinics(id)  on delete cascade,
  patient_id          uuid references public.patients(id) on delete set null,
  type                text not null,           -- prescription|appointment_reminder|payment_due|recall|custom
  channel             text not null default 'whatsapp',  -- whatsapp|sms|email
  recipient           text,                     -- phone/email snapshot at send time
  payload             jsonb not null default '{}',
  status              text not null default 'queued',    -- queued|sent|failed
  provider            text not null default 'stub',
  provider_message_id text,
  error               text,
  created_by          uuid references public.staff(id) on delete set null,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists notification_logs_clinic_idx  on public.notification_logs (clinic_id, created_at desc);
create index if not exists notification_logs_patient_idx on public.notification_logs (patient_id);
```

---

## 4. Data-Integrity Fixes

### 4.1 Overpayment guard — `transaction.recordPayment`
When `treatmentPlanId` is present: fetch `{ estimated_cost, collected_amount }`, compute `outstanding = max(0, estimated_cost − collected_amount)`. If `amount > outstanding + 0.01`, throw a `ValidationError` (maps to HTTP 400) with message and `{ outstanding, attempted }` in details. Ad-hoc payments (no plan) are unguarded by design — there is nothing to exceed. Overpayment math lives in a pure helper `payment-math.mjs` (`outstandingFor`, `isOverpayment`) for node tests.

### 4.2 Appointment conflict detection — `appointments.controller.create`
Before insert: query non-cancelled appointments for the same `clinic_id` + `appointment_date`, then test overlap of `[time, time+duration)` against the new slot using a pure `slot-overlap.mjs` helper (`overlaps(aStart,aDur,bStart,bDur)`). On overlap return **409** `{ error, conflict:{ id, time, purpose, patientName } }`. Body flag `allowDoubleBook:true` bypasses (intentional double-booking). Appointments with no `appointment_time` (date-only suggestions) never conflict. Recurring creation reuses this check per slot.

### 4.3 complete-consult `patientId` optional — `queue.routes.js` + validator
`completeConsult` validator: `patientId` becomes `uuid.optional().nullable()`. In the route, if absent, load the queue entry (`id` + `clinic_id`) and use its `patient_id`; 404 if the entry is missing/foreign. The transaction service signature is unchanged.

### 4.4 Gender case-insensitivity — validator
`gender: z.preprocess(v => typeof v === 'string' ? v.trim().toLowerCase() : v, z.enum(['male','female','other']).optional().nullable())`. `"Male"` / `" FEMALE "` now normalise and pass.

### 4.5 `pendingFollowUps: 0` — clarify, not "fix"
That metric counts overdue **visit** follow-ups (`visits.follow_up_date <= today and follow_up_done=false`). The QA created **appointment** follow-ups with future dates, so `0` was correct. No code change to the metric. The doctor dashboard (§5.2) separately surfaces upcoming **recalls** from appointments so the operational intent is served. Documented in API.md to prevent a false regression report.

### 4.6 Lab `in_progress` — doc only
`pending|sent|received|completed` is the intended enum. The QA's `in_progress` was an invalid value, not a bug. Closed by documenting valid values in API.md; no alias added (YAGNI).

---

## 5. New Read Endpoints — `/api/dashboard/*`

New router `src/routes/dashboard.routes.js`, mounted at `/api/dashboard`, all **clinic-scoped** (not `dentist_id`-scoped — fixes the cross-staff blindness for these clinic-wide views). `/api/analytics/dashboard` is left intact for back-compat. Read helpers shared via `src/services/dashboard.service.js`.

### 5.1 GET `/api/dashboard/receptionist`
```
{ waiting, inConsultation, readyForCheckout,      // queue counts (today)
  pendingBillsTotal, pendingBillsCount,           // Σ active-plan pending_amount
  nextAppointments: [...],                        // today, upcoming, not cancelled
  activeConsultations: [...] }                     // queue entries in_consultation
```

### 5.2 GET `/api/dashboard/doctor`
```
{ consultsToday, completedToday,
  activeTreatments: [...],   // treatment_plans status=active
  pendingProcedures: [...],  // suggested appointments (future sittings)
  recallsDue: [...],         // appointments purpose~recall/review within window
  recentPatients: [...] }
```

### 5.3 GET `/api/dashboard/finance`
```
{ todayCollections,         // Σ payments where payment_date=today
  pendingDuesTotal,         // Σ active-plan pending_amount, clinic-wide
  labPaymentsOutstanding,   // Σ lab_orders (charged_to_patient − ...) where status≠completed
  completedTreatmentsToday, // treatment_plans completed today
  paymentsToday: [...] }
```

---

## 6. New Write/Feature Endpoints

### 6.1 Tooth chart
- `GET  /api/patients/:id/tooth-chart` → `{ chart: [ { toothNumber, conditions, surfaces, notes, updatedAt } ] }`
- `PUT  /api/patients/:id/tooth-chart/:toothNumber` → upsert `{ conditions[], surfaces?, notes? }`, clinic-scoped, validates condition enum, stamps `updated_by`.
- The existing `GET /api/patients/:id/tooth-history` merges stored chart `conditions` into each tooth entry (additive field `currentConditions`), so the odontogram can colour teeth without inventing a visit.

### 6.2 Recurring appointments
- `POST /api/appointments/recurring`
  `{ patientId, startDate, intervalDays, count, purpose, appointmentTime?, durationMinutes?, allowDoubleBook? }`
  Generates `count` dates at `intervalDays` spacing from `startDate`. Each slot runs §4.2 conflict detection; conflicting slots are **skipped** (not failed) unless `allowDoubleBook`. Returns `{ created:[...], skipped:[{date,reason}] }`. `count` capped at 60. Date math in pure `recurrence.mjs` (`buildSchedule(startDate, intervalDays, count)`).

### 6.3 Payment plans (EMI)
New router `src/routes/payment-plans.routes.js`:
- `POST   /api/payment-plans` `{ patientId, treatmentPlanId?, totalAmount, advancePaid?, emiAmount, emiFrequency?, startDate? }` — computes `installments_total` + first `next_due_date` via `emi.mjs`.
- `GET    /api/payment-plans/patient/:patientId`
- `GET    /api/payment-plans/:id` — includes a derived installment schedule + paid/remaining. `paid` = `advance_paid` + Σ `payments.amount` for the plan's `treatment_plan_id` (when set); if the EMI plan has no `treatment_plan_id`, `paid` = `advance_paid` only (no payment source to attribute). `remaining` = `total_amount − paid`.
- `PATCH  /api/payment-plans/:id` — adjust `emiAmount`, `status`, `nextDueDate`.
`emi.mjs` (pure): `installmentsFor(total, advance, emi)`, `buildSchedule(startDate, freq, n, emi)`, `advanceDueDate(date, freq)`.

### 6.4 Notifications (provider-agnostic)
- `src/services/notifications/provider.js` — interface `send({to, channel, type, body}) → { providerMessageId }`.
- `src/services/notifications/stub.provider.js` — logs, returns a synthetic id, always succeeds. Selected by `NOTIFICATION_PROVIDER` env (default `stub`; `twilio`/`wati` reserved).
- `src/services/notifications/notifications.service.js` — `notify(ctx)`: builds payload, inserts a `notification_logs` row (`queued`), calls provider, updates row to `sent`/`failed`, returns the log. Body builders are pure (`buildPrescriptionMessage`, `buildReminderMessage`, …) for node tests.
- Router `src/routes/notifications.routes.js`:
  - `POST /api/notifications` — generic `{ patientId, type, channel?, body?, payload? }`
  - `POST /api/notifications/prescription/:prescriptionId` — pulls Rx + patient, builds message
  - `POST /api/notifications/reminder` — `{ appointmentId }`
  - `POST /api/notifications/payment-due` — `{ patientId, treatmentPlanId? }`
  - `POST /api/notifications/recall` — `{ patientId, dueDate, reason? }`
  - `GET  /api/notifications` — clinic log feed (paginated)
  Every send persists a log row and returns `{ notification }`.

---

## 7. UHID Generation

Pure helper `src/utils/uhid.mjs`:
- `clinicPrefix(clinic)` → 3-letter uppercase from `clinic.name` (fallback `display_id` prefix, fallback `PAT`).
- `formatUhid(prefix, seq)` → `` `${prefix}-${String(seq).padStart(4,'0')}` ``.
App flow in `patients.controller.create`: resolve prefix from the request's clinic, compute next sequence as `count(patients where clinic_id=…) + 1`, format, insert; on the unique-index violation (`23505`) retry with `seq+1` up to a few times. UHID returned in the create response. Node test covers prefix derivation, padding, and the collision-increment path (pure parts).

---

## 8. Consistency & Documentation

- New `backend/API.md` — for every endpoint touched/added: method, path, request fields (exact camelCase names), enums with allowed values, response shape, error codes. Explicitly documents the historical traps: `gender` is case-insensitive now; appointments use `appointmentDate`+`appointmentTime` (not `scheduledAt`) and `purpose` (not `type`); lab status enum; complete-consult `patientId` now optional.
- All new validators added to `src/validators/index.js` and exported; all mutating routes use `validate(...)`.
- All multi-table writes call `audit.log(...)`.

---

## 9. Testing Strategy

### 9.1 Pure unit tests (dependency-free `.mjs`, run via `node`)
Matches the existing `store/consultDraft.test.mjs` pattern.
- `uhid.test.mjs` — prefix, padding, increment.
- `payment-math.test.mjs` — outstanding, overpayment boundary (exact, +0.01, under).
- `slot-overlap.test.mjs` — adjacent, nested, identical, no-overlap, null-time.
- `recurrence.test.mjs` — count, spacing, month/week intervals.
- `emi.test.mjs` — installment count rounding, schedule dates, due-date advance.
- notification body builders — render correctness, no PII leakage beyond intent.

### 9.2 Live API smoke script — `backend/scripts/qa_smoke.mjs`
Re-runs the QA report scenarios against a running server (OTP dev login → create clinic → 4 patients → all flows). Asserts the regressions are closed:
- overpayment → **400** with `outstanding`
- duplicate slot → **409**
- complete-consult **without** `patientId` → **success**
- patient create returns a **`uhid`**
- `/api/dashboard/finance` returns non-zero `todayCollections` + `pendingDuesTotal`
- tooth-chart PUT then GET round-trips conditions
- recurring create returns N appointments
- payment-plan create returns correct `installments_total`
- notification send writes a `notification_logs` row and returns `status:"sent"`
Prints a pass/fail line per assertion; exit non-zero on any failure.

### 9.3 No app source modified by tests
Tests are additive; the smoke script only calls public endpoints.

---

## 10. Frontend Minimal Wiring (Next.js)

Follow `dentai-app/AGENTS.md` (read the Next guide before coding). New thin services mirror existing ones.
- `lib/services/dashboard.service.js` (new) → finance numbers into `app/finance/`, receptionist/doctor counts where those screens render.
- `lib/services/notification.service.js` (new) → a "Send via WhatsApp" action on the prescription/checkout surface calls `/api/notifications/prescription/:id`.
- `lib/services/payment.service.js` (extend) → payment-plan create/read for the EMI display on long-term treatments.
- Patient form/cards → add `guardianName`/`guardianPhone` inputs; show `uhid` on patient cards/detail.
- Checkout already shows pending balance (`pendingAmount` in checkout-summary) — verify it renders; no change expected.
- Tooth-chart status → `useClinicalStore` reads `currentConditions` from tooth-history to colour the odontogram; the editor calls the PUT endpoint.
No new top-level screens.

---

## 11. Rollout / Sequencing

1. Migration `010` + UHID backfill script (run in Supabase SQL editor + node script).
2. Validators + pure helpers + their node tests (red→green before wiring).
3. Data-integrity fixes (overpayment, conflict, complete-consult, gender).
4. UHID in patient create.
5. Dashboard endpoints.
6. Tooth-chart, recurring, payment-plans, notifications.
7. API.md.
8. Live smoke script — must be all-green.
9. Frontend wiring.
10. Commit. (No deploy/PR unless explicitly requested.)

Each backend unit is independently testable; the smoke script is the integration gate before frontend wiring.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `pending_amount` GENERATED on some deployments | Preserve existing write-then-retry-without behaviour; never hard-require writing it. |
| UHID race under concurrent registration | Unique `(clinic_id,uhid)` index + `23505` retry-with-increment. |
| Notification provider absent | Stub provider always succeeds; real provider is config-swapped later, interface fixed now. |
| Conflict detection over-blocking legitimate double-books | `allowDoubleBook` escape hatch; date-only suggestions never conflict. |
| Migration drift between file and live DB | Idempotent `if not exists`; live schema verified before writing this spec. |
| Backfill reassigning existing UHIDs | Backfill only touches `uhid is null`; idempotent. |
