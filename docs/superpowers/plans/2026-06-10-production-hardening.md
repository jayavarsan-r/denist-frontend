# DentAI Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every item in `dentai_test_report.md` — 3 hard failures, the critical blockers, and 11 missing endpoints — at production quality with backend + minimal frontend wiring.

**Architecture:** Express/Supabase backend (no ORM; repos in `src/repositories`, multi-table writes in `src/services/transaction.service.js`, Zod validators in `src/validators/index.js`, routers mounted in `src/server.js`). Pure logic is extracted into small `src/utils/*.js` modules tested with **jest** (`tests/*.test.js`). One idempotent SQL migration adds all new tables/columns. Next.js 16 frontend gets thin new services + field wiring only.

**Tech Stack:** Node 18+, Express, `@supabase/supabase-js`, Zod, jest, pdfkit (existing), Next.js 16 + Zustand (frontend).

---

## Conventions (read before starting)

- **Tests are jest, CommonJS.** New pure helpers are `src/utils/<name>.js` (`module.exports = {...}`) with tests in `tests/<name>.test.js`. Run a single file: `npx jest tests/<name>.test.js`. Run all: `npm test`.
- **Errors:** throw from `src/utils/errors.js` helpers — `badRequest(msg, details)` → 400, `conflict(msg, details)` → 409, `notFound(msg)` → 404. The envelope middleware turns thrown `AppError`s into `{success:false,error:{code,message,details}}`.
- **Validation:** every mutating route uses `validate(v.<schema>)`; schemas are added to `src/validators/index.js` and exported in its `module.exports`.
- **Clinic scoping:** read/write with `.eq('clinic_id', req.clinicId)`; guard `if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' })` at the top of each handler (existing pattern).
- **Audit:** multi-table writes in the transaction service end with `audit.log({...})`.
- **Migration is hand-run.** DDL cannot go through the REST client. After writing `010_qa_hardening.sql`, apply it in the Supabase SQL editor (Dashboard → SQL Editor), then verify via REST. Everything else is automated.
- **Commit after every task** (frequent commits). Branch is `refactor/security-pass`; stay on it.

---

## File Structure

**New backend files**
- `backend/migrations/010_qa_hardening.sql` — all schema additions (idempotent)
- `backend/scripts/backfill_uhid.mjs` — one-off UHID backfill (node, reuses helper)
- `backend/src/utils/uhid.js` + `tests/uhid.test.js`
- `backend/src/utils/payment-math.js` + `tests/payment-math.test.js`
- `backend/src/utils/slot-overlap.js` + `tests/slot-overlap.test.js`
- `backend/src/utils/recurrence.js` + `tests/recurrence.test.js`
- `backend/src/utils/emi.js` + `tests/emi.test.js`
- `backend/src/services/notifications/provider.js` (interface + selector)
- `backend/src/services/notifications/stub.provider.js`
- `backend/src/services/notifications/messages.js` + `tests/notification-messages.test.js`
- `backend/src/services/notifications/notifications.service.js`
- `backend/src/routes/notifications.routes.js`
- `backend/src/routes/payment-plans.routes.js`
- `backend/src/routes/dashboard.routes.js`
- `backend/src/services/dashboard.service.js`
- `backend/API.md`

**Modified backend files**
- `backend/src/validators/index.js` — gender preprocess, complete-consult optional patientId, + new schemas
- `backend/src/services/transaction.service.js` — overpayment guard
- `backend/src/controllers/appointments.controller.js` — conflict detection + recurring
- `backend/src/controllers/patients.controller.js` — UHID + guardian
- `backend/src/routes/appointments.routes.js` — recurring route
- `backend/src/routes/patients.routes.js` — tooth-chart routes + tooth-history merge
- `backend/src/routes/queue.routes.js` — complete-consult patientId default
- `backend/src/server.js` — mount new routers
- `backend/scripts/smoke.js` — new assertions

**Frontend (minimal wiring)**
- `dentai-app/lib/services/dashboard.service.js` (new)
- `dentai-app/lib/services/notification.service.js` (new)
- `dentai-app/lib/services/payment.service.js` (extend)
- Patient form/cards + tooth-chart store wiring (exact files located during Task 16)

---

## Task 1: Schema migration `010_qa_hardening.sql`

**Files:**
- Create: `backend/migrations/010_qa_hardening.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Migration 010 — QA hardening: UHID, guardians, tooth_chart, payment_plans,
-- notification_logs, treatment_plans.metadata. Idempotent (safe to re-run).
-- Run in the Supabase SQL editor. Verify with REST after applying.
-- ============================================================================

-- ── patients: UHID + guardian ───────────────────────────────────────────────
alter table public.patients add column if not exists uhid           text;
alter table public.patients add column if not exists guardian_name  text;
alter table public.patients add column if not exists guardian_phone text;
create unique index if not exists patients_clinic_uhid_uniq
  on public.patients (clinic_id, uhid) where uhid is not null;

-- ── treatment_plans: structured metadata (implant brand/lot/size, stages) ────
alter table public.treatment_plans add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ── tooth_chart: current per-tooth status (one row per tooth) ────────────────
create table if not exists public.tooth_chart (
  id           uuid primary key default uuid_generate_v4(),
  clinic_id    uuid references public.clinics(id)  on delete cascade,
  patient_id   uuid references public.patients(id) on delete cascade,
  tooth_number text not null,
  conditions   jsonb not null default '[]'::jsonb,
  surfaces     jsonb,
  notes        text,
  updated_by   uuid references public.staff(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (clinic_id, patient_id, tooth_number)
);
create index if not exists tooth_chart_patient_idx on public.tooth_chart (clinic_id, patient_id);

-- ── payment_plans: EMI schedule ──────────────────────────────────────────────
create table if not exists public.payment_plans (
  id                 uuid primary key default uuid_generate_v4(),
  clinic_id          uuid references public.clinics(id)         on delete cascade,
  patient_id         uuid references public.patients(id)        on delete cascade,
  treatment_plan_id  uuid references public.treatment_plans(id) on delete set null,
  total_amount       numeric(10,2) not null default 0,
  advance_paid       numeric(10,2) not null default 0,
  emi_amount         numeric(10,2) not null default 0,
  emi_frequency      text not null default 'monthly',
  installments_total int  not null default 0,
  next_due_date      date,
  status             text not null default 'active',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
create index if not exists payment_plans_patient_idx on public.payment_plans (clinic_id, patient_id);
create index if not exists payment_plans_plan_idx    on public.payment_plans (treatment_plan_id);

-- ── notification_logs: audit + provider-swap target ──────────────────────────
create table if not exists public.notification_logs (
  id                  uuid primary key default uuid_generate_v4(),
  clinic_id           uuid references public.clinics(id)  on delete cascade,
  patient_id          uuid references public.patients(id) on delete set null,
  type                text not null,
  channel             text not null default 'whatsapp',
  recipient           text,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued',
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

- [ ] **Step 2: Apply it**

Open Supabase Dashboard → SQL Editor → paste the file → Run. (DDL cannot go through the REST client.)

- [ ] **Step 3: Verify columns/tables exist live**

Run (replace `$KEY` with `SUPABASE_SERVICE_KEY` from `backend/.env`):
```bash
SUPA="https://zkxpxyfnlmchtbknnghw.supabase.co"; KEY="<service_key>"
for t in tooth_chart payment_plans notification_logs; do
  printf "%s -> " "$t"; curl -s -o /dev/null -w "HTTP %{http_code}\n" "$SUPA/rest/v1/$t?limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"; done
curl -s "$SUPA/rest/v1/patients?select=uhid,guardian_name&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$SUPA/rest/v1/treatment_plans?select=metadata&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: each table `HTTP 200`; the patients/treatment_plans selects return rows (not a "column does not exist" error).

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/010_qa_hardening.sql
git commit -m "feat(db): migration 010 — uhid, guardians, tooth_chart, payment_plans, notification_logs, tp.metadata"
```

---

## Task 2: UHID helper (`uhid.js`)

**Files:**
- Create: `backend/src/utils/uhid.js`
- Test: `backend/tests/uhid.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/uhid.test.js
const { clinicPrefix, formatUhid } = require('../src/utils/uhid');

describe('uhid', () => {
  test('clinicPrefix derives 3 uppercase letters from clinic name', () => {
    expect(clinicPrefix({ name: 'Velora Dental Studio' })).toBe('VEL');
    expect(clinicPrefix({ name: 'A B' })).toBe('AB'); // fewer than 3 letters is fine
  });
  test('clinicPrefix falls back to display_id prefix then PAT', () => {
    expect(clinicPrefix({ name: '', display_id: 'DENT-CHE-123' })).toBe('DENT');
    expect(clinicPrefix({})).toBe('PAT');
  });
  test('formatUhid zero-pads to 4 digits', () => {
    expect(formatUhid('VEL', 1)).toBe('VEL-0001');
    expect(formatUhid('VEL', 73)).toBe('VEL-0073');
    expect(formatUhid('VEL', 12345)).toBe('VEL-12345'); // no truncation past 4
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/uhid.test.js`
Expected: FAIL — "Cannot find module '../src/utils/uhid'".

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/utils/uhid.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/uhid.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/uhid.js backend/tests/uhid.test.js
git commit -m "feat(uhid): pure clinicPrefix + formatUhid helpers with tests"
```

---

## Task 3: Generate UHID + guardians on patient create

**Files:**
- Modify: `backend/src/validators/index.js` (createPatient — add guardian fields; gender preprocess done in Task 7)
- Modify: `backend/src/controllers/patients.controller.js:36-47` (create)
- Create: `backend/scripts/backfill_uhid.mjs`

- [ ] **Step 1: Add guardian fields to the createPatient validator**

In `src/validators/index.js`, the `createPatient` object (currently lines ~21-29) — add two fields after `clinical_flags`:
```js
const createPatient = z.object({
  name: z.string().trim().min(1, 'Name required'),
  phone,
  age: z.coerce.number().int().min(0).max(150).optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(), // gender preprocess added in Task 7
  medical_conditions: optStr,
  allergies: optStr,
  clinical_flags: optStr,
  guardian_name:  optStr,
  guardian_phone: optStr,
});
```

- [ ] **Step 2: Generate UHID in the controller create**

Replace `exports.create` in `src/controllers/patients.controller.js` (lines 36-47) with:
```js
const supabase = require('../config/supabase');
const { clinicPrefix, formatUhid } = require('../utils/uhid');

exports.create = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      guardian_name, guardian_phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

    // UHID is per-clinic sequential with a collision-safe retry against the unique
    // (clinic_id, uhid) index added in migration 010.
    let uhid = null;
    if (req.clinicId) {
      const { data: clinic } = await supabase.from('clinics').select('name, display_id').eq('id', req.clinicId).single();
      const prefix = clinicPrefix(clinic || {});
      const { count } = await supabase.from('patients')
        .select('id', { count: 'exact', head: true }).eq('clinic_id', req.clinicId);
      let seq = (count || 0) + 1;
      for (let attempt = 0; attempt < 5 && !uhid; attempt++) {
        const candidate = formatUhid(prefix, seq);
        const { data, error } = await supabase.from('patients').select('id')
          .eq('clinic_id', req.clinicId).eq('uhid', candidate).maybeSingle();
        if (!error && !data) uhid = candidate; else seq++;
      }
    }

    const patient = await repos.patients.create({
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
      uhid,
    });
    res.status(201).json({ patient });
  } catch (e) { next(e); }
};
```
(Keep the existing `const repos = require('../repositories')` at the top of the file; only add the two new requires if not already present.)

Also extend `exports.update`'s whitelist so guardians can be edited later (the EditPatientSheet in Task 15 depends on this). Change the `allowed` array (currently line ~60) to:
```js
    const allowed = ['name', 'phone', 'age', 'gender', 'medical_conditions', 'allergies', 'clinical_flags', 'guardian_name', 'guardian_phone'];
```

- [ ] **Step 3: Manual verification against the live server**

Start the server if not running (`PORT=3000 npm start`), then:
```bash
# (reuse a fresh token via send-otp/verify-otp + create-clinic as in scripts/smoke.js)
curl -s -X POST http://localhost:3000/api/patients -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"UHID Test","phone":"9000000010","gender":"male","guardian_name":"Parent","guardian_phone":"9000000011"}' \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['data']['patient'];print('uhid:',p.get('uhid'),'guardian:',p.get('guardian_name'))"
```
Expected: prints a `uhid` like `VEL-0007` and `guardian: Parent`.

- [ ] **Step 4: Write the backfill script**

```js
// backend/scripts/backfill_uhid.mjs
// One-off: assign per-clinic sequential UHIDs to patients missing one.
// Idempotent — only touches rows where uhid is null. Run: node scripts/backfill_uhid.mjs
import { createClient } from '@supabase/supabase-js';
import { clinicPrefix, formatUhid } from '../src/utils/uhid.js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: clinics } = await supabase.from('clinics').select('id, name, display_id');
for (const clinic of clinics || []) {
  const prefix = clinicPrefix(clinic);
  const { data: patients } = await supabase.from('patients')
    .select('id, uhid, created_at').eq('clinic_id', clinic.id).order('created_at', { ascending: true });
  let seq = 0;
  for (const p of patients || []) {
    seq++;
    if (p.uhid) continue; // keep existing
    const uhid = formatUhid(prefix, seq);
    await supabase.from('patients').update({ uhid }).eq('id', p.id);
    console.log(`${clinic.name}: ${p.id} -> ${uhid}`);
  }
}
console.log('UHID backfill complete.');
```
Note: `src/utils/uhid.js` uses CommonJS but is imported here via ESM interop (Node supports `import` of CJS — named exports resolve because the module sets `module.exports = { clinicPrefix, formatUhid }`). If named-import fails on the runtime Node version, change to `import uhid from '../src/utils/uhid.js'; const { clinicPrefix, formatUhid } = uhid;`.

- [ ] **Step 5: Run the backfill**

Run: `cd backend && node scripts/backfill_uhid.mjs`
Expected: prints assignments and "UHID backfill complete." Re-running prints only "complete" (no reassignments).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/patients.controller.js backend/src/validators/index.js backend/scripts/backfill_uhid.mjs
git commit -m "feat(patients): generate per-clinic UHID + store guardian fields; backfill script"
```

---

## Task 4: Overpayment guard

**Files:**
- Create: `backend/src/utils/payment-math.js`
- Test: `backend/tests/payment-math.test.js`
- Modify: `backend/src/services/transaction.service.js:154-189` (recordPayment)

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/payment-math.test.js
const { outstandingFor, isOverpayment } = require('../src/utils/payment-math');

describe('payment-math', () => {
  test('outstandingFor never goes negative', () => {
    expect(outstandingFor({ estimated_cost: 2000, collected_amount: 1000 })).toBe(1000);
    expect(outstandingFor({ estimated_cost: 2000, collected_amount: 2500 })).toBe(0);
    expect(outstandingFor({ estimated_cost: null, collected_amount: null })).toBe(0);
  });
  test('isOverpayment respects a 1-paisa epsilon', () => {
    expect(isOverpayment(1000.005, 1000)).toBe(false); // within epsilon
    expect(isOverpayment(1000.02, 1000)).toBe(true);
    expect(isOverpayment(1000, 1000)).toBe(false);     // exact payoff allowed
    expect(isOverpayment(500, 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/payment-math.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/utils/payment-math.js
const EPSILON = 0.011; // tolerate sub-paisa float noise
function outstandingFor(plan = {}) {
  const est = parseFloat(plan.estimated_cost || 0) || 0;
  const got = parseFloat(plan.collected_amount || 0) || 0;
  return Math.max(0, est - got);
}
function isOverpayment(amount, outstanding) {
  return parseFloat(amount) > parseFloat(outstanding) + EPSILON;
}
module.exports = { outstandingFor, isOverpayment, EPSILON };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/payment-math.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the guard into recordPayment**

In `src/services/transaction.service.js`, add at the top with the other requires:
```js
const { outstandingFor, isOverpayment } = require('../utils/payment-math');
const { badRequest } = require('../utils/errors');
```
Then inside `recordPayment`, BEFORE the `repos.payments.create(...)` call, insert:
```js
  // Overpayment guard: when tied to a plan, a payment may not exceed the outstanding
  // balance. Ad-hoc payments (no plan) are unguarded — there is nothing to exceed.
  if (treatmentPlanId) {
    const { data: planRow } = await supabase.from('treatment_plans')
      .select('estimated_cost, collected_amount').eq('id', treatmentPlanId).single();
    if (planRow) {
      const outstanding = outstandingFor(planRow);
      if (isOverpayment(amount, outstanding)) {
        throw badRequest('Payment exceeds the outstanding balance', { outstanding, attempted: parseFloat(amount) });
      }
    }
  }
```

- [ ] **Step 6: Manual verification**

```bash
# create a plan with estimatedCost 2000, then try to pay 9999999 against it
curl -s -X POST http://localhost:3000/api/payments -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PID\",\"treatmentPlanId\":\"$PLAN\",\"amount\":9999999,\"paymentMethod\":\"upi\"}" \
  -w "\nHTTP %{http_code}\n"
```
Expected: `HTTP 400`, body contains `"outstanding"`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/payment-math.js backend/tests/payment-math.test.js backend/src/services/transaction.service.js
git commit -m "feat(payments): reject payments exceeding plan outstanding balance"
```

---

## Task 5: Appointment conflict detection

**Files:**
- Create: `backend/src/utils/slot-overlap.js`
- Test: `backend/tests/slot-overlap.test.js`
- Modify: `backend/src/controllers/appointments.controller.js:53-74` (create)
- Modify: `backend/src/validators/index.js` (createAppointment — add `allowDoubleBook`)

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/slot-overlap.test.js
const { toMinutes, overlaps } = require('../src/utils/slot-overlap');

describe('slot-overlap', () => {
  test('toMinutes parses HH:MM', () => {
    expect(toMinutes('10:15')).toBe(615);
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes(null)).toBe(null);
    expect(toMinutes('bad')).toBe(null);
  });
  test('overlaps detects intersecting windows', () => {
    expect(overlaps('10:00', 30, '10:15', 30)).toBe(true);  // partial
    expect(overlaps('10:00', 30, '10:00', 30)).toBe(true);  // identical
    expect(overlaps('10:00', 60, '10:30', 15)).toBe(true);  // nested
    expect(overlaps('10:00', 30, '10:30', 30)).toBe(false); // adjacent, no overlap
    expect(overlaps('10:00', 30, '11:00', 30)).toBe(false); // disjoint
  });
  test('overlaps is false when either time is missing (date-only suggestions)', () => {
    expect(overlaps(null, 30, '10:00', 30)).toBe(false);
    expect(overlaps('10:00', 30, null, 30)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/slot-overlap.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/utils/slot-overlap.js
function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function overlaps(aStart, aDur, bStart, bDur) {
  const a = toMinutes(aStart), b = toMinutes(bStart);
  if (a == null || b == null) return false;
  const aEnd = a + (parseInt(aDur, 10) || 30);
  const bEnd = b + (parseInt(bDur, 10) || 30);
  return a < bEnd && b < aEnd;
}
module.exports = { toMinutes, overlaps };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/slot-overlap.test.js`
Expected: PASS.

- [ ] **Step 5: Add `allowDoubleBook` to the validator**

In `src/validators/index.js`, `createAppointment` — add:
```js
  allowDoubleBook: z.coerce.boolean().optional(),
```

- [ ] **Step 6: Wire conflict detection into create**

In `src/controllers/appointments.controller.js`, add at top:
```js
const supabase = require('../config/supabase');
const { overlaps } = require('../utils/slot-overlap');
const { conflict } = require('../utils/errors');
```
Replace `exports.create` (lines 53-74) with:
```js
exports.create = async (req, res, next) => {
  try {
    const { patientId, appointmentDate, appointmentTime, purpose, toothNumber, durationMinutes, allowDoubleBook } = req.body;
    const dur = durationMinutes || 30;

    // Conflict detection: same clinic + date, overlapping [time, time+duration).
    // Date-only suggestions (no time) never conflict. `allowDoubleBook` bypasses.
    if (appointmentTime && !allowDoubleBook && req.clinicId) {
      const { data: sameDay } = await supabase.from('appointments')
        .select('id, appointment_time, duration_minutes, purpose, patients(name)')
        .eq('clinic_id', req.clinicId).eq('appointment_date', appointmentDate)
        .neq('status', 'cancelled');
      const clash = (sameDay || []).find(a => overlaps(appointmentTime, dur, a.appointment_time, a.duration_minutes || 30));
      if (clash) {
        throw conflict('Time slot already booked', {
          id: clash.id, time: clash.appointment_time, purpose: clash.purpose,
          patientName: clash.patients?.name || null,
        });
      }
    }

    const base = {
      patient_id: patientId, dentist_id: req.dentistId, clinic_id: req.clinicId || null,
      appointment_date: appointmentDate, appointment_time: appointmentTime,
      purpose, tooth_number: toothNumber || null,
    };
    let appointment;
    try {
      appointment = await repos.appointments.create({ ...base, duration_minutes: dur });
    } catch (e) {
      appointment = await repos.appointments.create(base);
    }
    res.status(201).json({ appointment });
  } catch (e) { next(e); }
};
```

- [ ] **Step 7: Manual verification**

```bash
# book the same slot twice
P='{"patientId":"'$PID'","appointmentDate":"2026-07-01","appointmentTime":"10:00","purpose":"A","durationMinutes":30}'
curl -s -X POST http://localhost:3000/api/appointments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$P" -o /dev/null -w "first: %{http_code}\n"
curl -s -X POST http://localhost:3000/api/appointments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$P" -w "\nsecond: %{http_code}\n"
```
Expected: `first: 201`, `second: 409` with a `conflict` payload. Adding `"allowDoubleBook":true` to the body makes the second `201`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/slot-overlap.js backend/tests/slot-overlap.test.js backend/src/controllers/appointments.controller.js backend/src/validators/index.js
git commit -m "feat(appointments): detect double-booking (409) with allowDoubleBook override"
```

---

## Task 6: complete-consult — default `patientId` from the queue entry

**Files:**
- Modify: `backend/src/validators/index.js` (completeConsult — patientId optional)
- Modify: `backend/src/routes/queue.routes.js:271-282` (complete-consult route)
- Modify: `backend/tests/validators.test.js` (update the now-stale assertion)

- [ ] **Step 1: Update the validator**

In `src/validators/index.js`, `completeConsult` — change `patientId: uuid,` to:
```js
  patientId: uuid.optional().nullable(), // defaults from the queue entry in the route
```

- [ ] **Step 2: Update the stale validator test**

In `tests/validators.test.js`, the test `'completeConsult requires patientId + non-empty procedure'` asserts a missing-patientId failure indirectly via procedure. Replace that test with:
```js
  test('completeConsult: patientId optional, procedure must be non-empty when present', () => {
    expect(v.completeConsult.safeParse({ procedure: 'RCT' }).success).toBe(true); // no patientId now OK
    expect(v.completeConsult.safeParse({ patientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', procedure: '' }).success).toBe(false);
  });
```

- [ ] **Step 3: Run the validator test**

Run: `npx jest tests/validators.test.js`
Expected: PASS (the updated test green).

- [ ] **Step 4: Default patientId in the route**

In `src/routes/queue.routes.js`, replace the `/:id/complete-consult` handler body (lines 271-282) with:
```js
router.post('/:id/complete-consult', auth, validate(v.completeConsult), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    let { patientId } = req.body;
    const { procedure, diagnosis, toothNumber, toothNumbers, totalSittings, estimatedCost, transcript, notes, followUp } = req.body;

    // The queue entry already knows the patient — default from it so the client
    // never has to resend patientId (was a silent 400 trap).
    if (!patientId) {
      const { data: entry } = await supabase.from('queue_entries')
        .select('patient_id').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
      if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
      patientId = entry.patient_id;
    }

    const result = await transaction.completeConsultation({
      clinicId: req.clinicId, dentistId: req.dentistId, staffId: req.staffId, requestId: req.id,
      queueId: req.params.id,
      patientId, procedure, diagnosis, toothNumber, toothNumbers, totalSittings, estimatedCost, transcript, notes, followUp,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Manual verification**

```bash
# call in a waiting entry, then complete WITHOUT patientId in the body
curl -s -X PATCH http://localhost:3000/api/queue/$QID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"status":"in_consultation"}' -o /dev/null
curl -s -X POST http://localhost:3000/api/queue/$QID/complete-consult -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"procedure":"RCT","estimatedCost":2000}' -w "\nHTTP %{http_code}\n"
```
Expected: `HTTP 201` (no patientId sent).

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/index.js backend/src/routes/queue.routes.js backend/tests/validators.test.js
git commit -m "fix(queue): complete-consult defaults patientId from the queue entry"
```

---

## Task 7: Gender case-insensitivity

**Files:**
- Modify: `backend/src/validators/index.js` (createPatient gender)
- Modify: `backend/tests/validators.test.js` (add a case)

- [ ] **Step 1: Write the failing test**

Add to `tests/validators.test.js`:
```js
  test('gender is case-insensitive and trimmed', () => {
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: 'Male' }).data.gender).toBe('male');
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: ' FEMALE ' }).data.gender).toBe('female');
    expect(v.createPatient.safeParse({ name: 'A', phone: '9876543210', gender: 'alien' }).success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/validators.test.js -t "case-insensitive"`
Expected: FAIL — `'Male'` currently rejected, `.data` is undefined.

- [ ] **Step 3: Update the gender field**

In `createPatient`, replace the `gender` line with:
```js
  gender: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.enum(['male', 'female', 'other']).optional().nullable()
  ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/validators.test.js -t "case-insensitive"`
Expected: PASS. Also run the full file: `npx jest tests/validators.test.js` → all green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/index.js backend/tests/validators.test.js
git commit -m "fix(validators): accept gender case-insensitively"
```

---

## Task 8: Recurring appointments

**Files:**
- Create: `backend/src/utils/recurrence.js`
- Test: `backend/tests/recurrence.test.js`
- Modify: `backend/src/validators/index.js` (add `recurringAppointments`)
- Modify: `backend/src/controllers/appointments.controller.js` (add `createRecurring`)
- Modify: `backend/src/routes/appointments.routes.js` (mount route)

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/recurrence.test.js
const { buildSchedule } = require('../src/utils/recurrence');

describe('recurrence', () => {
  test('buildSchedule returns count dates at intervalDays spacing', () => {
    expect(buildSchedule('2026-06-10', 30, 3)).toEqual(['2026-06-10', '2026-07-10', '2026-08-09']);
  });
  test('weekly spacing', () => {
    expect(buildSchedule('2026-06-10', 7, 2)).toEqual(['2026-06-10', '2026-06-17']);
  });
  test('count is clamped to [0, 60]', () => {
    expect(buildSchedule('2026-06-10', 30, 0)).toEqual([]);
    expect(buildSchedule('2026-06-10', 30, 999).length).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/recurrence.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/utils/recurrence.js
// Pure date arithmetic for recurring appointments. UTC-based to avoid TZ drift.
function buildSchedule(startDateISO, intervalDays, count) {
  const n = Math.max(0, Math.min(60, parseInt(count, 10) || 0));
  const step = parseInt(intervalDays, 10) || 1;
  const out = [];
  const base = new Date(`${startDateISO}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * step);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
module.exports = { buildSchedule };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/recurrence.test.js`
Expected: PASS.

- [ ] **Step 5: Add the validator**

In `src/validators/index.js`, add and export `recurringAppointments`:
```js
const recurringAppointments = z.object({
  patientId: uuid,
  startDate: z.string().min(1),
  intervalDays: z.coerce.number().int().positive(),
  count: z.coerce.number().int().min(1).max(60),
  purpose: optStr,
  appointmentTime: z.string().optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().optional().nullable(),
  allowDoubleBook: z.coerce.boolean().optional(),
});
```
Add `recurringAppointments` to the `module.exports` list.

- [ ] **Step 6: Add the controller method**

In `src/controllers/appointments.controller.js` (after `create`), add:
```js
exports.createRecurring = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, startDate, intervalDays, count, purpose, appointmentTime, durationMinutes, allowDoubleBook } = req.body;
    const dur = durationMinutes || 30;
    const dates = require('../utils/recurrence').buildSchedule(startDate, intervalDays, count);

    let existing = [];
    if (appointmentTime && !allowDoubleBook) {
      const { data } = await supabase.from('appointments')
        .select('appointment_date, appointment_time, duration_minutes')
        .eq('clinic_id', req.clinicId).in('appointment_date', dates).neq('status', 'cancelled');
      existing = data || [];
    }

    const created = [], skipped = [];
    for (const date of dates) {
      if (appointmentTime && !allowDoubleBook) {
        const clash = existing.find(a => a.appointment_date === date &&
          overlaps(appointmentTime, dur, a.appointment_time, a.duration_minutes || 30));
        if (clash) { skipped.push({ date, reason: 'conflict' }); continue; }
      }
      const base = {
        patient_id: patientId, dentist_id: req.dentistId, clinic_id: req.clinicId,
        appointment_date: date, appointment_time: appointmentTime || null,
        purpose: purpose || 'Recurring visit', status: 'scheduled',
      };
      let row;
      try { row = await repos.appointments.create({ ...base, duration_minutes: dur }); }
      catch { row = await repos.appointments.create(base); }
      created.push(row);
      if (appointmentTime) existing.push({ appointment_date: date, appointment_time: appointmentTime, duration_minutes: dur });
    }
    res.status(201).json({ created, skipped });
  } catch (e) { next(e); }
};
```

- [ ] **Step 7: Mount the route**

In `src/routes/appointments.routes.js`, add (BEFORE any `/:id` param route to avoid shadowing):
```js
router.post('/recurring', auth, validate(v.recurringAppointments), ctrl.createRecurring);
```
Confirm `auth`, `validate`, and `v` are already required in that file; if not, add `const validate = require('../middleware/validate'); const v = require('../validators');`.

- [ ] **Step 8: Manual verification**

```bash
curl -s -X POST http://localhost:3000/api/appointments/recurring -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PID\",\"startDate\":\"2026-08-01\",\"intervalDays\":30,\"count\":6,\"purpose\":\"Ortho review\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('created:',len(d['created']),'skipped:',len(d['skipped']))"
```
Expected: `created: 6 skipped: 0`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/utils/recurrence.js backend/tests/recurrence.test.js backend/src/validators/index.js backend/src/controllers/appointments.controller.js backend/src/routes/appointments.routes.js
git commit -m "feat(appointments): recurring/bulk recall scheduling with per-slot conflict skip"
```

---

## Task 9: Payment plans (EMI)

**Files:**
- Create: `backend/src/utils/emi.js`
- Test: `backend/tests/emi.test.js`
- Modify: `backend/src/validators/index.js` (createPaymentPlan, updatePaymentPlan)
- Create: `backend/src/routes/payment-plans.routes.js`
- Modify: `backend/src/server.js` (mount)

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/emi.test.js
const { installmentsFor, advanceDueDate, buildSchedule } = require('../src/utils/emi');

describe('emi', () => {
  test('installmentsFor ceilings (total-advance)/emi', () => {
    expect(installmentsFor(85000, 20000, 5000)).toBe(13); // 65000/5000
    expect(installmentsFor(40500, 20000, 5000)).toBe(5);  // 20500/5000 -> 4.1 -> 5
    expect(installmentsFor(1000, 1000, 5000)).toBe(0);    // nothing outstanding
    expect(installmentsFor(1000, 0, 0)).toBe(0);          // guard /0
  });
  test('advanceDueDate steps by frequency', () => {
    expect(advanceDueDate('2026-06-10', 'monthly')).toBe('2026-07-10');
    expect(advanceDueDate('2026-06-10', 'weekly')).toBe('2026-06-17');
    expect(advanceDueDate('2026-06-10', 'biweekly')).toBe('2026-06-24');
  });
  test('buildSchedule returns n dated installments of emi', () => {
    const s = buildSchedule('2026-06-10', 'monthly', 2, 5000);
    expect(s).toEqual([
      { dueDate: '2026-07-10', amount: 5000 },
      { dueDate: '2026-08-10', amount: 5000 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/emi.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/utils/emi.js
function installmentsFor(total, advance, emi) {
  const outstanding = Math.max(0, (parseFloat(total) || 0) - (parseFloat(advance) || 0));
  const per = parseFloat(emi) || 0;
  if (per <= 0 || outstanding <= 0) return 0;
  return Math.ceil(outstanding / per);
}
function advanceDueDate(dateISO, freq) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (freq === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1); // monthly default
  return d.toISOString().slice(0, 10);
}
function buildSchedule(startISO, freq, n, emi) {
  const out = [];
  let due = startISO;
  for (let i = 0; i < n; i++) {
    due = advanceDueDate(due, freq);
    out.push({ dueDate: due, amount: parseFloat(emi) || 0 });
  }
  return out;
}
module.exports = { installmentsFor, advanceDueDate, buildSchedule };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/emi.test.js`
Expected: PASS.

- [ ] **Step 5: Add validators**

In `src/validators/index.js`, add + export:
```js
const EMI_FREQ = ['monthly', 'weekly', 'biweekly'];
const createPaymentPlan = z.object({
  patientId: uuid,
  treatmentPlanId: uuid.optional().nullable(),
  totalAmount: z.coerce.number().nonnegative(),
  advancePaid: z.coerce.number().nonnegative().optional(),
  emiAmount: z.coerce.number().positive(),
  emiFrequency: z.enum(EMI_FREQ).optional(),
  startDate: z.string().optional().nullable(),
  notes: optStr,
});
const updatePaymentPlan = z.object({
  emiAmount: z.coerce.number().positive().optional(),
  emiFrequency: z.enum(EMI_FREQ).optional(),
  nextDueDate: z.string().optional().nullable(),
  status: z.enum(['active', 'completed', 'defaulted', 'cancelled']).optional(),
  notes: optStr,
});
```
Export both in `module.exports`.

- [ ] **Step 6: Write the router**

```js
// backend/src/routes/payment-plans.routes.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const { installmentsFor, advanceDueDate, buildSchedule } = require('../utils/emi');

// POST /api/payment-plans — create an EMI schedule
router.post('/', auth, validate(v.createPaymentPlan), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId, totalAmount, advancePaid, emiAmount, emiFrequency, startDate, notes } = req.body;
    const freq = emiFrequency || 'monthly';
    const start = startDate || new Date().toISOString().slice(0, 10);
    const installments = installmentsFor(totalAmount, advancePaid || 0, emiAmount);
    const nextDue = installments > 0 ? advanceDueDate(start, freq) : null;
    const { data, error } = await supabase.from('payment_plans').insert({
      clinic_id: req.clinicId, patient_id: patientId, treatment_plan_id: treatmentPlanId || null,
      total_amount: totalAmount, advance_paid: advancePaid || 0, emi_amount: emiAmount,
      emi_frequency: freq, installments_total: installments, next_due_date: nextDue,
      status: 'active', notes: notes || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ plan: data });
  } catch (e) { next(e); }
});

// GET /api/payment-plans/patient/:patientId
router.get('/patient/:patientId', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('payment_plans')
      .select('*').eq('patient_id', req.params.patientId).eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (e) { next(e); }
});

// GET /api/payment-plans/:id — plan + derived schedule + paid/remaining
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { data: plan, error } = await supabase.from('payment_plans')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (error) throw error;
    if (!plan) return res.status(404).json({ error: 'Payment plan not found' });

    // paid = advance + payments attributed to the linked treatment plan (if any)
    let paid = parseFloat(plan.advance_paid || 0);
    if (plan.treatment_plan_id) {
      const { data: pays } = await supabase.from('payments')
        .select('amount').eq('treatment_plan_id', plan.treatment_plan_id).eq('clinic_id', req.clinicId);
      paid += (pays || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    }
    const schedule = buildSchedule(plan.created_at.slice(0, 10), plan.emi_frequency, plan.installments_total, plan.emi_amount);
    res.json({ plan, paid, remaining: Math.max(0, parseFloat(plan.total_amount || 0) - paid), schedule });
  } catch (e) { next(e); }
});

// PATCH /api/payment-plans/:id
router.patch('/:id', auth, validate(v.updatePaymentPlan), async (req, res, next) => {
  try {
    const map = { emiAmount: 'emi_amount', emiFrequency: 'emi_frequency', nextDueDate: 'next_due_date', status: 'status', notes: 'notes' };
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, col] of Object.entries(map)) if (req.body[k] !== undefined) updates[col] = req.body[k];
    const { data, error } = await supabase.from('payment_plans')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId).select().single();
    if (error) throw error;
    res.json({ plan: data });
  } catch (e) { next(e); }
});

module.exports = router;
```

- [ ] **Step 7: Mount it**

In `src/server.js`, after the payments mount (line 53), add:
```js
app.use('/api/payment-plans', require('./routes/payment-plans.routes'));
```

- [ ] **Step 8: Manual verification**

```bash
curl -s -X POST http://localhost:3000/api/payment-plans -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PID\",\"totalAmount\":85000,\"advancePaid\":20000,\"emiAmount\":5000}" \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['data']['plan'];print('installments:',p['installments_total'],'nextDue:',p['next_due_date'])"
```
Expected: `installments: 13 nextDue: <~1 month out>`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/utils/emi.js backend/tests/emi.test.js backend/src/validators/index.js backend/src/routes/payment-plans.routes.js backend/src/server.js
git commit -m "feat(payments): EMI/payment-plan model + endpoints with derived schedule"
```

---

## Task 9b: Treatment-plan structured metadata (implant brand/lot/size, stages)

Closes spec §3.2 — implant details move out of free-text `notes` into `treatment_plans.metadata` (jsonb, added in migration 010).

**Files:**
- Modify: `backend/src/validators/index.js` (createTreatmentPlan, updateTreatmentPlan)
- Modify: `backend/src/services/transaction.service.js:191-205` (createTreatmentPlan)
- Modify: `backend/src/routes/treatment-plans.routes.js:11-20` (POST passthrough) and `:31-58` (PATCH)

- [ ] **Step 1: Accept `metadata` in the validators**

In `src/validators/index.js`, add `metadata: z.record(z.any()).optional()` to BOTH `createTreatmentPlan` and `updateTreatmentPlan` objects (after their existing fields).

- [ ] **Step 2: Persist metadata on create (transaction service)**

In `src/services/transaction.service.js`, `createTreatmentPlan(ctx)` — add `metadata` to the destructure and to the insert:
```js
async function createTreatmentPlan(ctx) {
  const { clinicId, dentistId, staffId, requestId, patientId, diagnosis, procedureName,
    totalSittings, estimatedCost, notes, startDate, expectedEndDate, metadata } = ctx;
  const plan = await repos.treatmentPlans.create({
    patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
    diagnosis: diagnosis || null, procedure_name: procedureName,
    total_sittings: totalSittings || 1, completed_sittings: 0,
    estimated_cost: estimatedCost ? parseFloat(estimatedCost) : 0, collected_amount: 0,
    notes: notes || null, start_date: startDate || new Date().toISOString().split('T')[0],
    expected_end_date: expectedEndDate || null,
    metadata: metadata || {},
  });
  audit.log({ clinicId, staffId, requestId, action: 'CREATE', entityType: 'treatment_plan', entityId: plan.id });
  return plan;
}
```

- [ ] **Step 3: Pass metadata through the POST route**

In `src/routes/treatment-plans.routes.js`, the `router.post('/')` handler (line ~14) builds the `transaction.createTreatmentPlan({...})` argument from `req.body`. Add `metadata: req.body.metadata` to that object so it reaches the service.

- [ ] **Step 4: Allow metadata on PATCH**

In the same file's `router.patch('/:id')` handler, after the existing `if (req.body.notes) updates.notes = req.body.notes;` line, add:
```js
    if (req.body.metadata !== undefined) updates.metadata = req.body.metadata;
```

- [ ] **Step 5: Manual verification**

```bash
curl -s -X POST http://localhost:3000/api/treatment-plans -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PID\",\"procedureName\":\"Single Implant\",\"estimatedCost\":40500,\"metadata\":{\"implant\":{\"brand\":\"Straumann\",\"size\":\"4.2x10mm\",\"lot\":\"ST-88392\"}}}" \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['data'];p=p.get('plan',p);print('implant:',p.get('metadata',{}).get('implant'))"
```
Expected: prints the structured implant object (brand/size/lot), not free text.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/index.js backend/src/services/transaction.service.js backend/src/routes/treatment-plans.routes.js
git commit -m "feat(treatment-plans): structured metadata (implant brand/lot/size, stages)"
```

---

## Task 10: Notifications (provider-agnostic)

**Files:**
- Create: `backend/src/services/notifications/messages.js`
- Test: `backend/tests/notification-messages.test.js`
- Create: `backend/src/services/notifications/stub.provider.js`
- Create: `backend/src/services/notifications/provider.js`
- Create: `backend/src/services/notifications/notifications.service.js`
- Create: `backend/src/routes/notifications.routes.js`
- Modify: `backend/src/validators/index.js` (notification schemas)
- Modify: `backend/src/server.js` (mount)

- [ ] **Step 1: Write the failing test for message builders**

```js
// backend/tests/notification-messages.test.js
const { buildPrescriptionMessage, buildReminderMessage, buildPaymentDueMessage, buildRecallMessage } = require('../src/services/notifications/messages');

describe('notification messages', () => {
  test('prescription lists each medicine by name + frequency', () => {
    const msg = buildPrescriptionMessage({ name: 'Karthik' }, [
      { name: 'Amoxicillin 500mg', frequency: 'Twice daily', duration: '5 days' },
      { name: 'Zerodol SP', frequency: 'After food', duration: '3 days' },
    ]);
    expect(msg).toContain('Karthik');
    expect(msg).toContain('Amoxicillin 500mg');
    expect(msg).toContain('Twice daily');
    expect(msg).toContain('Zerodol SP');
  });
  test('prescription with no medicines is still a valid non-empty message', () => {
    const msg = buildPrescriptionMessage({ name: 'A' }, []);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
  test('reminder includes date + time', () => {
    expect(buildReminderMessage({ name: 'Meena' }, { appointment_date: '2026-06-15', appointment_time: '16:30', purpose: 'RCT' }))
      .toMatch(/2026-06-15.*16:30/s);
  });
  test('payment-due includes amount', () => {
    expect(buildPaymentDueMessage({ name: 'Raj' }, 1000)).toContain('1000');
  });
  test('recall includes reason + date', () => {
    expect(buildRecallMessage({ name: 'Aadhya' }, '2026-07-10', 'Ortho review')).toMatch(/Ortho review.*2026-07-10/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/notification-messages.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the message builders**

```js
// backend/src/services/notifications/messages.js
// Pure WhatsApp/SMS body builders. No I/O — fully unit-testable.
function buildPrescriptionMessage(patient, medicines = []) {
  const lines = (medicines || []).map(m =>
    `• ${m.name || 'Medicine'}${m.frequency ? ` — ${m.frequency}` : ''}${m.duration ? ` (${m.duration})` : ''}`);
  const body = lines.length ? lines.join('\n') : 'No medicines were prescribed.';
  return `Hi ${patient?.name || 'there'}, here is your prescription from the clinic:\n${body}\n\nPlease follow the dosage as advised.`;
}
function buildReminderMessage(patient, appt) {
  return `Hi ${patient?.name || 'there'}, this is a reminder for your appointment on ${appt?.appointment_date || ''}` +
    `${appt?.appointment_time ? ` at ${appt.appointment_time}` : ''}` +
    `${appt?.purpose ? ` (${appt.purpose})` : ''}. See you soon!`;
}
function buildPaymentDueMessage(patient, amount) {
  return `Hi ${patient?.name || 'there'}, you have a pending balance of ₹${amount} at the clinic. Kindly clear it at your next visit. Thank you.`;
}
function buildRecallMessage(patient, dueDate, reason) {
  return `Hi ${patient?.name || 'there'}, it's time for your ${reason || 'review'} on ${dueDate}. Please book a slot at your convenience.`;
}
module.exports = { buildPrescriptionMessage, buildReminderMessage, buildPaymentDueMessage, buildRecallMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/notification-messages.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the provider (stub + selector)**

```js
// backend/src/services/notifications/stub.provider.js
// Default provider: pretends to send and returns a synthetic id. Swap for a real
// Twilio/WATI provider later; the interface { send(ctx) } is fixed.
module.exports = {
  name: 'stub',
  async send({ to, channel, type }) {
    return { providerMessageId: `stub-${type}-${channel}-${Date.now()}` };
  },
};
```
```js
// backend/src/services/notifications/provider.js
// Selects the active provider from NOTIFICATION_PROVIDER (default 'stub').
// Add real providers here later: case 'twilio': return require('./twilio.provider');
function getProvider() {
  const name = process.env.NOTIFICATION_PROVIDER || 'stub';
  switch (name) {
    case 'stub':
    default:
      return require('./stub.provider');
  }
}
module.exports = { getProvider };
```

- [ ] **Step 6: Write the service**

```js
// backend/src/services/notifications/notifications.service.js
// Persists a notification_logs row, calls the active provider, updates the row to
// sent/failed, and returns it. The provider is config-swappable; logging always happens.
const supabase = require('../../config/supabase');
const { getProvider } = require('./provider');

async function notify({ clinicId, staffId, patientId, type, channel = 'whatsapp', recipient, body, payload = {} }) {
  const provider = getProvider();
  const { data: row, error } = await supabase.from('notification_logs').insert({
    clinic_id: clinicId, patient_id: patientId || null, type, channel,
    recipient: recipient || null, payload: { ...payload, body }, status: 'queued',
    provider: provider.name, created_by: staffId || null,
  }).select().single();
  if (error) throw error;

  try {
    const { providerMessageId } = await provider.send({ to: recipient, channel, type, body });
    const { data: sent } = await supabase.from('notification_logs')
      .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: new Date().toISOString() })
      .eq('id', row.id).select().single();
    return sent;
  } catch (e) {
    const { data: failed } = await supabase.from('notification_logs')
      .update({ status: 'failed', error: e.message || String(e) }).eq('id', row.id).select().single();
    return failed;
  }
}
module.exports = { notify };
```

- [ ] **Step 7: Add validators**

In `src/validators/index.js`, add + export:
```js
const sendNotification = z.object({
  patientId: uuid.optional().nullable(),
  type: z.enum(['prescription', 'appointment_reminder', 'payment_due', 'recall', 'custom']),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  body: optStr,
  payload: z.any().optional(),
});
const notifyReminder   = z.object({ appointmentId: uuid });
const notifyPaymentDue = z.object({ patientId: uuid, treatmentPlanId: uuid.optional().nullable() });
const notifyRecall     = z.object({ patientId: uuid, dueDate: z.string().min(1), reason: optStr });
```
Export all four.

- [ ] **Step 8: Write the router**

```js
// backend/src/routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const { notify } = require('../services/notifications/notifications.service');
const msg = require('../services/notifications/messages');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { outstandingFor } = require('../utils/payment-math');

const ctx = (req) => ({ clinicId: req.clinicId, staffId: req.staffId });

// POST /api/notifications — generic
router.post('/', auth, validate(v.sendNotification), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, type, channel, body, payload } = req.body;
    let recipient = null;
    if (patientId) {
      const { data: p } = await supabase.from('patients').select('phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
      recipient = p?.phone || null;
    }
    const notification = await notify({ ...ctx(req), patientId, type, channel, recipient, body: body || '', payload: payload || {} });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/prescription/:prescriptionId
router.post('/prescription/:prescriptionId', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: rx } = await supabase.from('prescriptions')
      .select('*, patients(name, phone)').eq('id', req.params.prescriptionId).maybeSingle();
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    const body = msg.buildPrescriptionMessage(rx.patients, rx.medicines || []);
    const notification = await notify({ ...ctx(req), patientId: rx.patient_id, type: 'prescription',
      recipient: rx.patients?.phone || null, body, payload: { prescriptionId: rx.id } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/reminder
router.post('/reminder', auth, validate(v.notifyReminder), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: appt } = await supabase.from('appointments')
      .select('*, patients(name, phone)').eq('id', req.body.appointmentId).eq('clinic_id', req.clinicId).maybeSingle();
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const body = msg.buildReminderMessage(appt.patients, appt);
    const notification = await notify({ ...ctx(req), patientId: appt.patient_id, type: 'appointment_reminder',
      recipient: appt.patients?.phone || null, body, payload: { appointmentId: appt.id } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/payment-due
router.post('/payment-due', auth, validate(v.notifyPaymentDue), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId } = req.body;
    const { data: p } = await supabase.from('patients').select('name, phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
    let amount = 0;
    if (treatmentPlanId) {
      const { data: plan } = await supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('id', treatmentPlanId).maybeSingle();
      if (plan) amount = outstandingFor(plan);
    } else {
      const { data: plans } = await supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('patient_id', patientId).eq('status', 'active');
      amount = (plans || []).reduce((s, pl) => s + outstandingFor(pl), 0);
    }
    const body = msg.buildPaymentDueMessage(p, amount);
    const notification = await notify({ ...ctx(req), patientId, type: 'payment_due', recipient: p?.phone || null, body, payload: { amount } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/recall
router.post('/recall', auth, validate(v.notifyRecall), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, dueDate, reason } = req.body;
    const { data: p } = await supabase.from('patients').select('name, phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
    const body = msg.buildRecallMessage(p, dueDate, reason);
    const notification = await notify({ ...ctx(req), patientId, type: 'recall', recipient: p?.phone || null, body, payload: { dueDate, reason } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// GET /api/notifications — clinic log feed (paginated)
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { from, to, page, limit } = parsePagination(req.query);
    const { data, error, count } = await supabase.from('notification_logs')
      .select('*', { count: 'exact' }).eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    res.json({ notifications: data || [], pagination: pageMeta({ page, limit }, count) });
  } catch (e) { next(e); }
});

module.exports = router;
```

- [ ] **Step 9: Mount it**

In `src/server.js`, after the payment-plans mount, add:
```js
app.use('/api/notifications', require('./routes/notifications.routes'));
```

- [ ] **Step 10: Manual verification**

```bash
curl -s -X POST http://localhost:3000/api/notifications/prescription/$PRESC_ID -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;n=json.load(sys.stdin)['data']['notification'];print('status:',n['status'],'provider:',n['provider'])"
```
Expected: `status: sent provider: stub`.

- [ ] **Step 11: Run all jest tests + commit**

Run: `npm test` → all green.
```bash
git add backend/src/services/notifications backend/tests/notification-messages.test.js backend/src/routes/notifications.routes.js backend/src/validators/index.js backend/src/server.js
git commit -m "feat(notifications): provider-agnostic notification service + endpoints (stub provider)"
```

---

## Task 11: Tooth chart (read + write)

**Files:**
- Modify: `backend/src/validators/index.js` (toothChartUpsert)
- Modify: `backend/src/routes/patients.routes.js` (GET tooth-chart, PUT tooth-chart/:toothNumber, merge into tooth-history)

- [ ] **Step 1: Add the validator**

In `src/validators/index.js`, add + export:
```js
const TOOTH_CONDITIONS = ['healthy','caries','infection','rct_initiated','rct_completed',
  'temporary_restoration','permanent_restoration','crown','missing','implant','extraction_advised','mobility'];
const toothChartUpsert = z.object({
  conditions: z.array(z.enum(TOOTH_CONDITIONS)).default([]),
  surfaces: z.any().optional(),
  notes: optStr,
});
```
Export `toothChartUpsert` and `TOOTH_CONDITIONS`.

- [ ] **Step 2: Add the routes**

In `src/routes/patients.routes.js`, confirm `validate` and `v` are required (add if missing). Add these routes near the other `/:id/...` sub-routes:
```js
// GET /api/patients/:id/tooth-chart — current per-tooth status
router.get('/:id/tooth-chart', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data, error } = await supabase.from('tooth_chart')
      .select('tooth_number, conditions, surfaces, notes, updated_at')
      .eq('clinic_id', req.clinicId).eq('patient_id', req.params.id);
    if (error) throw error;
    res.json({ chart: (data || []).map(r => ({
      toothNumber: r.tooth_number, conditions: r.conditions || [], surfaces: r.surfaces || null,
      notes: r.notes || '', updatedAt: r.updated_at,
    })) });
  } catch (e) { next(e); }
});

// PUT /api/patients/:id/tooth-chart/:toothNumber — upsert status for one tooth
router.put('/:id/tooth-chart/:toothNumber', auth, validate(v.toothChartUpsert), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { conditions, surfaces, notes } = req.body;
    const { data, error } = await supabase.from('tooth_chart').upsert({
      clinic_id: req.clinicId, patient_id: req.params.id, tooth_number: req.params.toothNumber,
      conditions, surfaces: surfaces || null, notes: notes || null,
      updated_by: req.staffId || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,patient_id,tooth_number' }).select().single();
    if (error) throw error;
    res.json({ tooth: { toothNumber: data.tooth_number, conditions: data.conditions, surfaces: data.surfaces, notes: data.notes } });
  } catch (e) { next(e); }
});
```
Confirm the file already requires `supabase` and `auth`; both are used by the existing `/:id/tooth-history` handler, so they are present.

- [ ] **Step 3: Merge stored status into tooth-history**

In the existing `GET /:id/tooth-history` handler, just before it builds the response (where `toothMap` is finalized into `Array.from(toothMap.values())`), add a fetch + merge so each tooth carries its current conditions:
```js
    // Merge current per-tooth status from tooth_chart (additive field; never overwrites history).
    const { data: chartRows } = await supabase.from('tooth_chart')
      .select('tooth_number, conditions').eq('clinic_id', req.clinicId).eq('patient_id', req.params.id);
    const chartByTooth = new Map((chartRows || []).map(r => [r.tooth_number, r.conditions || []]));
    toothMap.forEach((entry, tn) => { entry.currentConditions = chartByTooth.get(tn) || []; });
```
Place this after the existing `toothMap.forEach(...)` normalisation block and before the `res.json({...})`. (If the handler is clinic-or-dentist scoped differently, match the existing `.eq(...)` scoping used in that handler for the other queries.)

- [ ] **Step 4: Manual verification**

```bash
curl -s -X PUT "http://localhost:3000/api/patients/$PID/tooth-chart/36" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"conditions":["infection","rct_initiated","temporary_restoration"]}' \
  | python3 -c "import sys,json;print('saved:',json.load(sys.stdin)['data']['tooth']['conditions'])"
curl -s "http://localhost:3000/api/patients/$PID/tooth-chart" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print('chart:',json.load(sys.stdin)['data']['chart'])"
```
Expected: save echoes the 3 conditions; GET returns tooth 36 with those conditions.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/index.js backend/src/routes/patients.routes.js
git commit -m "feat(tooth-chart): per-tooth status upsert + read, merged into tooth-history"
```

---

## Task 12: Role dashboards

**Files:**
- Create: `backend/src/services/dashboard.service.js`
- Create: `backend/src/routes/dashboard.routes.js`
- Modify: `backend/src/server.js` (mount)

- [ ] **Step 1: Write the dashboard service**

```js
// backend/src/services/dashboard.service.js
// Clinic-scoped aggregations for the three role dashboards. Read-only.
const supabase = require('../config/supabase');
const { outstandingFor } = require('../utils/payment-math');
const today = () => new Date().toISOString().slice(0, 10);

async function receptionist(clinicId) {
  const t = today();
  const [{ data: q }, { data: appts }, { data: plans }] = await Promise.all([
    supabase.from('queue_entries').select('id, status, patient_id, token_number, patients(name)').eq('clinic_id', clinicId).eq('queue_date', t),
    supabase.from('appointments').select('id, appointment_date, appointment_time, purpose, patients(name)').eq('clinic_id', clinicId).gte('appointment_date', t).neq('status', 'cancelled').order('appointment_date').order('appointment_time').limit(10),
    supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('clinic_id', clinicId).eq('status', 'active'),
  ]);
  const queue = q || [];
  const pendingPlans = (plans || []).filter(p => outstandingFor(p) > 0);
  return {
    waiting: queue.filter(e => e.status === 'waiting').length,
    inConsultation: queue.filter(e => e.status === 'in_consultation').length,
    readyForCheckout: queue.filter(e => e.status === 'ready_for_checkout').length,
    pendingBillsTotal: pendingPlans.reduce((s, p) => s + outstandingFor(p), 0),
    pendingBillsCount: pendingPlans.length,
    nextAppointments: appts || [],
    activeConsultations: queue.filter(e => e.status === 'in_consultation'),
  };
}

async function doctor(clinicId) {
  const t = today();
  const [{ data: q }, { data: visits }, { data: plans }, { data: suggested }, { data: recents }] = await Promise.all([
    supabase.from('queue_entries').select('id, status').eq('clinic_id', clinicId).eq('queue_date', t),
    supabase.from('visits').select('id').eq('clinic_id', clinicId).eq('visit_date', t),
    supabase.from('treatment_plans').select('id, procedure_name, total_sittings, completed_sittings, patient_id, patients(name)').eq('clinic_id', clinicId).eq('status', 'active').limit(20),
    supabase.from('appointments').select('id, appointment_date, appointment_time, purpose, patients(name)').eq('clinic_id', clinicId).eq('status', 'suggested').gte('appointment_date', t).order('appointment_date').limit(20),
    supabase.from('patients').select('id, name, uhid, created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(5),
  ]);
  const queue = q || [];
  const recalls = (suggested || []).filter(a => /recall|review|follow/i.test(a.purpose || ''));
  return {
    consultsToday: queue.length,
    completedToday: (visits || []).length,
    activeTreatments: plans || [],
    pendingProcedures: suggested || [],
    recallsDue: recalls,
    recentPatients: recents || [],
  };
}

async function finance(clinicId) {
  const t = today();
  const [{ data: pays }, { data: plans }, { data: labs }, { data: completed }] = await Promise.all([
    supabase.from('payments').select('amount, payment_method, patients(name)').eq('clinic_id', clinicId).eq('payment_date', t),
    supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('clinic_id', clinicId).eq('status', 'active'),
    supabase.from('lab_orders').select('charged_to_patient, cost_to_clinic, status').eq('clinic_id', clinicId).neq('status', 'completed'),
    supabase.from('treatment_plans').select('id').eq('clinic_id', clinicId).eq('status', 'completed').gte('updated_at', `${t}T00:00:00`),
  ]);
  return {
    todayCollections: (pays || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0),
    pendingDuesTotal: (plans || []).reduce((s, p) => s + outstandingFor(p), 0),
    labPaymentsOutstanding: (labs || []).reduce((s, l) => s + parseFloat(l.charged_to_patient || 0), 0),
    completedTreatmentsToday: (completed || []).length,
    paymentsToday: pays || [],
  };
}

module.exports = { receptionist, doctor, finance };
```

- [ ] **Step 2: Write the router**

```js
// backend/src/routes/dashboard.routes.js
const router = require('express').Router();
const auth = require('../middleware/auth');
const dash = require('../services/dashboard.service');

function guard(req, res) { if (!req.clinicId) { res.status(403).json({ error: 'No clinic context' }); return false; } return true; }

router.get('/receptionist', auth, async (req, res, next) => {
  try { if (!guard(req, res)) return; res.json(await dash.receptionist(req.clinicId)); } catch (e) { next(e); }
});
router.get('/doctor', auth, async (req, res, next) => {
  try { if (!guard(req, res)) return; res.json(await dash.doctor(req.clinicId)); } catch (e) { next(e); }
});
router.get('/finance', auth, async (req, res, next) => {
  try { if (!guard(req, res)) return; res.json(await dash.finance(req.clinicId)); } catch (e) { next(e); }
});

module.exports = router;
```

- [ ] **Step 3: Mount it**

In `src/server.js`, after the notifications mount, add:
```js
app.use('/api/dashboard', require('./routes/dashboard.routes'));
```

- [ ] **Step 4: Manual verification**

```bash
for r in receptionist doctor finance; do
  echo "== $r =="; curl -s "http://localhost:3000/api/dashboard/$r" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(list(json.load(sys.stdin)['data'].keys()))"; done
```
Expected: receptionist keys include `pendingBillsTotal`; finance keys include `todayCollections`, `pendingDuesTotal`; doctor keys include `recallsDue`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboard.service.js backend/src/routes/dashboard.routes.js backend/src/server.js
git commit -m "feat(dashboard): clinic-scoped receptionist/doctor/finance dashboards"
```

---

## Task 13: API documentation (`API.md`)

**Files:**
- Create: `backend/API.md`

- [ ] **Step 1: Write API.md**

Document every endpoint touched or added. Use this structure (fill all rows — no placeholders):
```markdown
# DentAI Backend API

All responses are wrapped: success → `{ "success": true, "data": <payload> }`;
error → `{ "success": false, "error": { "code", "message", "details" } }`.
Auth: `Authorization: Bearer <jwt>` (from /api/auth/verify-otp → create-clinic/join-clinic).

## Conventions / Gotchas (historical traps — now documented)
- `gender` is **case-insensitive** and trimmed: `"Male"`, `" female "` are accepted → stored lowercase.
- Appointments use **`appointmentDate`** (YYYY-MM-DD) + **`appointmentTime`** (HH:MM) and **`purpose`** — NOT `scheduledAt`/`type`.
- `POST /api/queue/:id/complete-consult` — **`patientId` is optional**; it defaults from the queue entry.
- Lab order `status` enum: `pending | sent | received | completed` (no `in_progress`).
- `dashboard.pendingFollowUps` (legacy `/api/analytics/dashboard`) counts overdue **visit** follow-ups, NOT scheduled appointments — a future-dated appointment correctly does not increment it. Use `/api/dashboard/doctor` → `recallsDue` for upcoming recalls.

## Patients
### POST /api/patients
Request: `{ name*, phone*, age?, gender?(male|female|other, case-insensitive), medical_conditions?, allergies?, clinical_flags?, guardian_name?, guardian_phone? }`
Response: `{ patient: { id, uhid, name, ... , guardian_name, guardian_phone } }` — `uhid` is per-clinic, format `PREFIX-0001`.

### GET /api/patients/:id/tooth-chart
Response: `{ chart: [ { toothNumber, conditions[], surfaces, notes, updatedAt } ] }`
### PUT /api/patients/:id/tooth-chart/:toothNumber
Request: `{ conditions[] (healthy|caries|infection|rct_initiated|rct_completed|temporary_restoration|permanent_restoration|crown|missing|implant|extraction_advised|mobility), surfaces?, notes? }`
Response: `{ tooth: { toothNumber, conditions, surfaces, notes } }`

## Appointments
### POST /api/appointments
Request: `{ patientId*, appointmentDate*, appointmentTime?, purpose?, toothNumber?, durationMinutes?(30), allowDoubleBook?(false) }`
Errors: **409 CONFLICT** `{ details: { id, time, purpose, patientName } }` when the slot overlaps an existing one (unless `allowDoubleBook`).
### POST /api/appointments/recurring
Request: `{ patientId*, startDate*, intervalDays*, count*(1..60), purpose?, appointmentTime?, durationMinutes?, allowDoubleBook? }`
Response: `{ created: [...], skipped: [ { date, reason } ] }`

## Payments
### POST /api/payments
Request: `{ patientId*, treatmentPlanId?, queueEntryId?, amount*, paymentMethod?, notes?, paymentDate? }`
Errors: **400** `{ details: { outstanding, attempted } }` when `treatmentPlanId` is set and `amount` exceeds the plan's outstanding balance.

## Payment Plans (EMI)
### POST /api/payment-plans
Request: `{ patientId*, treatmentPlanId?, totalAmount*, advancePaid?, emiAmount*, emiFrequency?(monthly|weekly|biweekly), startDate?, notes? }`
Response: `{ plan: { ..., installments_total, next_due_date } }`
### GET /api/payment-plans/patient/:patientId → `{ plans: [...] }`
### GET /api/payment-plans/:id → `{ plan, paid, remaining, schedule: [ { dueDate, amount } ] }`
### PATCH /api/payment-plans/:id → `{ emiAmount?, emiFrequency?, nextDueDate?, status?, notes? }`

## Notifications
Provider selected by `NOTIFICATION_PROVIDER` env (default `stub`). Every call logs to `notification_logs`.
### POST /api/notifications → `{ patientId?, type(prescription|appointment_reminder|payment_due|recall|custom), channel?(whatsapp|sms|email), body?, payload? }`
### POST /api/notifications/prescription/:prescriptionId
### POST /api/notifications/reminder → `{ appointmentId }`
### POST /api/notifications/payment-due → `{ patientId, treatmentPlanId? }`
### POST /api/notifications/recall → `{ patientId, dueDate, reason? }`
### GET  /api/notifications → `{ notifications: [...], pagination }`
All POSTs return `{ notification: { status(sent|failed), provider, provider_message_id, ... } }`.

## Dashboards (clinic-scoped)
### GET /api/dashboard/receptionist → `{ waiting, inConsultation, readyForCheckout, pendingBillsTotal, pendingBillsCount, nextAppointments[], activeConsultations[] }`
### GET /api/dashboard/doctor → `{ consultsToday, completedToday, activeTreatments[], pendingProcedures[], recallsDue[], recentPatients[] }`
### GET /api/dashboard/finance → `{ todayCollections, pendingDuesTotal, labPaymentsOutstanding, completedTreatmentsToday, paymentsToday[] }`
```

- [ ] **Step 2: Commit**

```bash
git add backend/API.md
git commit -m "docs: API.md covering new endpoints + historical field/enum traps"
```

---

## Task 14: Extend the smoke test (integration gate)

**Files:**
- Modify: `backend/scripts/smoke.js`

- [ ] **Step 1: Read the existing smoke flow**

Read `backend/scripts/smoke.js` fully to learn its `api(method, path, {body})` helper, `log(name, ok, detail)` reporter, and the IDs it already creates (it logs in, creates a clinic, patients, queue, payments). Identify a created `patientId`, `treatmentPlanId`, `queueId`, and `prescriptionId` you can reuse.

- [ ] **Step 2: Append the new assertions**

Near the end of the run (before the summary print), add a block that exercises the new/fixed behaviour and asserts each. Use the file's existing `api()` and `log()` helpers:
```js
  // ── QA hardening assertions ──────────────────────────────────────────────
  // UHID present on patient create
  {
    const r = await api('POST', '/api/patients', { body: { name: 'Smoke UHID', phone: '9123456780', gender: 'Male' } });
    log('patient has uhid', r.status === 201 && !!r.data?.patient?.uhid, r.data?.patient?.uhid);
  }
  // Overpayment guard (needs a plan with a known estimated_cost)
  if (planId) {
    const r = await api('POST', '/api/payments', { body: { patientId, treatmentPlanId: planId, amount: 99999999, paymentMethod: 'upi' } });
    log('overpayment rejected (400)', r.status === 400, `HTTP ${r.status}`);
  }
  // Appointment conflict (book the same slot twice)
  {
    const slot = { patientId, appointmentDate: plusDaysISO(20), appointmentTime: '10:00', purpose: 'Smoke', durationMinutes: 30 };
    const a = await api('POST', '/api/appointments', { body: slot });
    const b = await api('POST', '/api/appointments', { body: slot });
    log('appointment conflict (409)', a.status === 201 && b.status === 409, `first ${a.status} / second ${b.status}`);
  }
  // complete-consult without patientId (uses a fresh in_consultation queue entry)
  if (queueId) {
    await api('PATCH', `/api/queue/${queueId}`, { body: { status: 'in_consultation' } });
    const r = await api('POST', `/api/queue/${queueId}/complete-consult`, { body: { procedure: 'Smoke RCT', estimatedCost: 1000 } });
    log('complete-consult without patientId', r.status === 201, `HTTP ${r.status}`);
  }
  // Recurring appointments
  {
    const r = await api('POST', '/api/appointments/recurring', { body: { patientId, startDate: plusDaysISO(40), intervalDays: 30, count: 4, purpose: 'Recall' } });
    log('recurring creates 4', r.status === 201 && (r.data?.created?.length === 4), `created ${r.data?.created?.length}`);
  }
  // Payment plan installments
  {
    const r = await api('POST', '/api/payment-plans', { body: { patientId, totalAmount: 85000, advancePaid: 20000, emiAmount: 5000 } });
    log('payment plan installments=13', r.status === 201 && r.data?.plan?.installments_total === 13, `n=${r.data?.plan?.installments_total}`);
  }
  // Tooth chart round-trip
  {
    const put = await api('PUT', `/api/patients/${patientId}/tooth-chart/36`, { body: { conditions: ['infection', 'rct_initiated'] } });
    const get = await api('GET', `/api/patients/${patientId}/tooth-chart`);
    const t36 = (get.data?.chart || []).find(c => c.toothNumber === '36');
    log('tooth-chart round-trip', put.status === 200 && !!t36 && t36.conditions.includes('infection'), JSON.stringify(t36?.conditions));
  }
  // Dashboards
  for (const role of ['receptionist', 'doctor', 'finance']) {
    const r = await api('GET', `/api/dashboard/${role}`);
    log(`dashboard ${role}`, r.status === 200, Object.keys(r.data || {}).join(','));
  }
  {
    const r = await api('GET', '/api/dashboard/finance');
    log('finance has collections+dues', r.status === 200 && 'todayCollections' in r.data && 'pendingDuesTotal' in r.data);
  }
  // Notification send + log
  if (prescriptionId) {
    const r = await api('POST', `/api/notifications/prescription/${prescriptionId}`, { body: {} });
    log('notification sent + logged', r.status === 201 && r.data?.notification?.status === 'sent', r.data?.notification?.status);
  }
```
If `planId` / `prescriptionId` aren't already captured in the script, capture them from the earlier create responses (assign to the outer-scope vars the script already uses for `patientId`/`queueId`).

- [ ] **Step 3: Run the smoke test green**

Run (in two shells):
```bash
# shell 1
cd backend && PORT=4000 npm start
# shell 2
cd backend && BASE=http://localhost:4000 node scripts/smoke.js; echo "exit=$?"
```
Expected: every new line prints ✅; `exit=0`. Fix any ❌ before committing.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/smoke.js
git commit -m "test(smoke): assert overpayment 400, conflict 409, uhid, dashboards, EMI, tooth-chart, notifications"
```

---

## Task 15: Frontend minimal wiring

> Per `dentai-app/AGENTS.md`, **read the relevant guide in `node_modules/next/dist/docs/` before writing frontend code.** Services use `import { apiClient } from '../api/client'`. Patient gender is already normalised client-side in `lib/services/patient.service.js` (`GENDER_MAP`).

**Files:**
- Create: `dentai-app/lib/services/dashboard.service.js`
- Create: `dentai-app/lib/services/notification.service.js`
- Modify: `dentai-app/lib/services/payment.service.js`
- Modify: `dentai-app/lib/services/index.js` (export the new services)
- Modify: `dentai-app/components/sheets/NewPatientSheet.jsx` + `EditPatientSheet.jsx` (guardian fields)
- Modify: a patient card/profile surface to show `uhid`
- Modify: `dentai-app/app/finance/` to render finance dashboard numbers
- Modify: `dentai-app/components/odontogram/Odontogram.jsx` (colour by `currentConditions`)

- [ ] **Step 1: Add the dashboard service**

```js
// dentai-app/lib/services/dashboard.service.js
import { apiClient } from '../api/client';

export async function getReceptionistDashboard() {
  const { data } = await apiClient.get('/api/dashboard/receptionist');
  return data;
}
export async function getDoctorDashboard() {
  const { data } = await apiClient.get('/api/dashboard/doctor');
  return data;
}
export async function getFinanceDashboard() {
  const { data } = await apiClient.get('/api/dashboard/finance');
  return data;
}
```
Match the actual return-unwrapping of `apiClient` (check whether existing services use `res.data` or `res.data.data` given the `{success,data}` envelope — mirror an existing service like `payment.service.js`).

- [ ] **Step 2: Add the notification service**

```js
// dentai-app/lib/services/notification.service.js
import { apiClient } from '../api/client';

export async function sendPrescription(prescriptionId) {
  const { data } = await apiClient.post(`/api/notifications/prescription/${prescriptionId}`, {});
  return data;
}
export async function sendPaymentDue(patientId, treatmentPlanId) {
  const { data } = await apiClient.post('/api/notifications/payment-due', { patientId, treatmentPlanId });
  return data;
}
export async function sendRecall(patientId, dueDate, reason) {
  const { data } = await apiClient.post('/api/notifications/recall', { patientId, dueDate, reason });
  return data;
}
export async function listNotifications() {
  const { data } = await apiClient.get('/api/notifications');
  return data;
}
```

- [ ] **Step 3: Extend payment.service.js with payment plans**

Append:
```js
export async function createPaymentPlan(payload) {
  const { data } = await apiClient.post('/api/payment-plans', payload);
  return data;
}
export async function getPatientPaymentPlans(patientId) {
  const { data } = await apiClient.get(`/api/payment-plans/patient/${patientId}`);
  return data;
}
export async function getPaymentPlan(id) {
  const { data } = await apiClient.get(`/api/payment-plans/${id}`);
  return data;
}
```

- [ ] **Step 4: Export new services**

In `lib/services/index.js`, add:
```js
export * from './dashboard.service';
export * from './notification.service';
```

- [ ] **Step 5: Guardian fields in patient sheets**

In `NewPatientSheet.jsx` and `EditPatientSheet.jsx`, add two inputs (guardian name + phone) following the existing input markup in those files, bound to local form state keys `guardian_name` / `guardian_phone`. Ensure `normaliseForApi` in `lib/services/patient.service.js` passes them through — add to the returned object:
```js
    guardian_name: data.guardian_name || data.guardianName || null,
    guardian_phone: data.guardian_phone || data.guardianPhone || null,
```

- [ ] **Step 6: Show UHID on the patient profile**

In `app/patients/[id]/PatientProfileClient.jsx`, render `patient.uhid` near the patient name (e.g. a muted chip `UHID: {patient.uhid}`) when present.

- [ ] **Step 7: Wire finance numbers**

In `app/finance/` (the finance screen client), call `getFinanceDashboard()` on mount and render `todayCollections`, `pendingDuesTotal`, `labPaymentsOutstanding`, `completedTreatmentsToday`. Match the screen's existing card/stat components.

- [ ] **Step 8: Colour the odontogram by current conditions**

In `components/odontogram/Odontogram.jsx`, when rendering each tooth, read `currentConditions` (now present on tooth-history entries) and apply a status colour (e.g. infection → red, rct_initiated → amber, restoration → blue). Add a "Send via WhatsApp" trigger on the prescription/checkout surface that calls `sendPrescription(prescriptionId)`.

- [ ] **Step 9: Compile check**

Run a dev build to confirm no module/JSX errors:
```bash
cd dentai-app && npx next build 2>&1 | tail -30
```
Expected: build completes; no "Module not found" for the new services. (If `next build` is heavy, a `next dev` boot + hitting `/finance` and `/patients` is an acceptable lighter check.)

- [ ] **Step 10: Commit**

```bash
git add dentai-app/lib/services dentai-app/components dentai-app/app
git commit -m "feat(frontend): wire dashboards, UHID, guardians, payment plans, notifications, tooth-chart colours"
```

---

## Final verification

- [ ] `cd backend && npm test` — all jest suites green (uhid, payment-math, slot-overlap, recurrence, emi, notification-messages, validators + existing).
- [ ] `cd backend && PORT=4000 npm start` then `BASE=http://localhost:4000 node scripts/smoke.js` — exit 0, all ✅.
- [ ] Frontend builds.
- [ ] `dentai_test_report.md` re-checked: every FAIL/MISSING row now has a closing task. (Notifications, dashboards, EMI, recurring, tooth-chart, UHID, guardian, overpayment, conflict, complete-consult all covered; lab `in_progress` + `pendingFollowUps` closed via API.md as documented-not-bugs.)

