# Schedule → Patient → Consult → Finance flow redesign

Date: 2026-06-11
Requested by: Jay (voice note). Implemented autonomously; spec records the design.

## Goals

1. **Schedule**: tapping an appointment must open the patient's detail page, not the
   `apptPeek` bottom drawer.
2. **Patient detail page**: a round mic **Start consultation** button at the bottom.
   Tapping it opens a drawer that is *already recording* (nice waveform UI), then
   autofills editable fields, then **one tap to confirm** (saves visit/plan/Rx) and
   **one more tap to check out** (collect payment) — no page rerouting.
3. **Consultation (queue) flow**: same minimal pattern — Record button opens the
   drawer already recording; after Confirm the same drawer offers payment collection
   ("Collect & check out") with "Send to front desk" as the escape hatch.
4. **Finance page**:
   - Stats show **Today**, **This month**, **Total collected**, and **Patients owe**
     (pending) separately.
   - Pending payments actually work (previously read a local-only `bills` array that
     was always empty) — now driven by treatment plans with `pending_amount > 0`,
     showing paid vs. remaining per patient.
   - Recent activity is open by default showing the latest 4 entries, each annotated
     with the procedure it paid for ("RCT", "Consultation"…), expandable to more.
   - Tapping a patient anywhere on the finance page deep-links to that patient's
     **Billing** tab (`/patients/{id}?tab=Billing`).
5. **Billing tab**: each payment row shows *what it paid for* (procedure name from the
   linked treatment plan; "Consultation" when unlinked).

## Backend additions (Express + Supabase)

- `GET /api/payments/stats` — clinic-scoped sums `{ today, month, total }` computed
  from `payments.amount` with `payment_date` filters. Registered before parameterised
  GET routes.
- `GET /api/treatment-plans` — clinic-wide list with `patients(id, name)` join.
  `?pending=1` filters `pending_amount > 0` (generated column). Defensive about
  `deleted_at` (live DB may pre-date migration 004): filtered in JS, not SQL.

Existing `GET /api/payments` already joins `patients(name)` and
`treatment_plans(procedure_name)` — reused for the annotated recent-activity feed.
`GET /api/patients/:id/tooth-history` already returns `payments[].treatmentPlanId`
plus `treatmentPlans[]` — the Billing tab maps plan id → procedure client-side.

## Frontend changes

- `app/schedule/page.jsx`: all appointment taps (Day blocks, Week rows, Month list,
  History rows) navigate to `/patients/{patientId}`.
- `app/patients/[id]/PatientProfileClient.jsx`:
  - bottom toolbar replaced by a round mic FAB labelled "Start consultation" that
    opens `patientConsult` with `{ autoStart: true }`;
  - reads `?tab=` via `useSearchParams` (Suspense-wrapped) so finance can deep-link
    to Billing;
  - Billing tab payment rows show procedure note.
- `components/sheets/PatientConsultSheet.jsx`: rebuilt as
  recording (auto-start) → processing → **editable review** (reuses `ConsultReview`)
  → confirm-save → **checkout step** (amount prefilled, Cash/UPI/Card, "Collect &
  finish" via `recordPayment` linked to the created plan; "Skip" closes).
- `components/sheets/ConsultRecordSheet.jsx`: honours `autoStart`; after Complete
  consult shows an in-drawer checkout (recordPayment + queue `checkout`), with
  "Send to front desk instead" preserving the receptionist flow.
- `components/consultation/ConsultReview.jsx`: gains a `completeLabel` prop.
- `app/finance/page.jsx`: 2×2 stat grid (Today / This month / Total collected /
  Patients owe), pending list from the new plans endpoint (shows paid X of Y),
  lab section unchanged, recent activity open by default (4 rows + Show all),
  all patient rows deep-link to Billing.
- `store/useClinicalStore.js`: `paymentStats`, `pendingPlans` + loaders;
  `loadClinicPayments` keeps procedure + patientId on each ledger entry.

## Error handling

All new loaders are non-fatal (console.warn) like their siblings. Payment collection
failures keep the drawer open with a toast so no data is lost. The consult save path
is unchanged (visit is mandatory; plan/Rx best-effort).

## Testing

- `node --test store/consultDraft.test.mjs` (existing pure-logic tests).
- Backend test suite (`backend/tests`).
- `next build` for the frontend.
- Smoke-boot the backend and hit the two new endpoints.
