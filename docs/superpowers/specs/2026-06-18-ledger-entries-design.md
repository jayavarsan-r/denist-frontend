# Design — Persistent income/expense ledger (issue #11)

**Date:** 2026-06-18
**Status:** Approved (pending written-spec review)

## Problem

The DentAI finance section lets a user add a manual income/expense entry via
`AddEntrySheet`, but the submit handler calls an **in-memory** `addAccount()` in
`useClinicalStore` — entries vanish on refresh. The user reported this as "entry
creation option is missing" (#11): the button exists but does not persist.

The same sheet has a **dead voice mic** (`onMic={() => showToast('Listening…')}`)
which is the unclear billing-voice from issue #12 — removed as part of this work.

## Goal

Persist manual income/expense entries to the database via a new table + CRUD
endpoint, and wire `AddEntrySheet` to it — with **no change** to the finance
screen's existing unified ledger view.

## Non-goals

- Not migrating or touching the existing `payments` table (patient collections).
- Not building double-entry accounting, reporting, or expense approval flows.
- Not adding payment-method/notes fields (deferred; match the current form shape).

## Decision: separate table, keep merging

The finance page (`app/finance/page.jsx`) already builds `clinicAccounts` as a
**unified view** merging two sources:
- API-backed `payments` → mapped to income entries (`loadClinicPayments`)
- in-memory manual entries (`addAccount`) ← the only non-persistent part

We keep that model. A new `ledger_entries` table holds ONLY manual income/expense
(rent, salary, supplies, lab costs, misc income). Patient collections stay in
`payments`. The finance view continues merging both. This gives each table one
clear purpose, requires no data migration, and does not risk the working payments
flow.

## 1. Database — migration `021_ledger_entries.sql`

Coded against live Supabase. Idempotent (`CREATE TABLE IF NOT EXISTS`), additive
(new empty table; touches no existing data), so safe to apply to the live DB.

```sql
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  type        text NOT NULL CHECK (type IN ('income','expense')),
  category    text NOT NULL,
  description text,
  amount      numeric NOT NULL CHECK (amount >= 0),
  entry_date  date NOT NULL DEFAULT CURRENT_DATE,
  patient_id  uuid,
  lab_case_id uuid,
  created_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_clinic_date
  ON public.ledger_entries (clinic_id, entry_date DESC) WHERE deleted_at IS NULL;
```

- `category` is free text validated by the app (`Treatment|Lab|Supplies|Rent|Salary|Other|...`).
- `patient_id` / `lab_case_id` are nullable optional links, **not** FK-enforced
  (matches the loose-link style used elsewhere; avoids migration-ordering issues).
- Soft delete via `deleted_at IS NULL` (the convention `base-clinic.repository`
  supports with `softDeleteColumn: 'deleted_at'`).

## 2. Backend

### Repository — `repositories/index.js`
```js
ledger: new BaseClinicRepository('ledger_entries', {
  softDeleteColumn: 'deleted_at',
  defaultOrder: { column: 'entry_date', ascending: false },
}),
```
Gives clinic-scoped CRUD + soft-delete filtering for free.

### Controller — `controllers/ledger.controller.js`
Mirrors `visits.controller` structure; `scopeOf(req) = { clinicId, dentistId }`.
- `list` — `repos.ledger.findAll(scope, { filters })`; optional `?type`, `?from`,
  `?to` (date range applied in the query builder). Responds
  `{ ledgerEntries: [...] }` (the response-envelope middleware wraps it as
  `{ success, data: { ledgerEntries } }`, which the client interceptor unwraps to
  `{ ledgerEntries }` — so the service returns `data.ledgerEntries`).
- `create` — maps camelCase body → snake_case row, sets `clinic_id`, `created_by:
  req.staffId`, defaults `entry_date` to today when absent.
- `update` — whitelist editable fields, set `updated_at`.
- `remove` — `repos.ledger.softDelete(id, scope, req.staffId)`.

### Routes — `routes/ledger.routes.js`
```js
router.use(auth);
router.use(requireClinic);              // ledger is strictly clinic-scoped
router.get('/', ctrl.list);
router.post('/', validate(v.createLedgerEntry), ctrl.create);
router.put('/:id', validate(v.updateLedgerEntry), ctrl.update);
router.delete('/:id', ctrl.remove);
```
Mount in `server.js`: `app.use('/api/ledger', require('./routes/ledger.routes'))`.

### Validators — `validators/index.js`
```js
const LEDGER_TYPES = ['income', 'expense'];
const createLedgerEntry = z.object({
  type: z.enum(LEDGER_TYPES),
  category: z.string().trim().min(1, 'category required'),
  description: optStr,
  amount: z.coerce.number().nonnegative(),
  entryDate: z.string().optional().nullable(),
  patientId: uuid.optional().nullable(),
  labCaseId: uuid.optional().nullable(),
});
const updateLedgerEntry = createLedgerEntry.partial();
```
Exported alongside the others.

## 3. Frontend

### Service — `lib/services/ledger.service.js`
`listLedger({ type, from, to })`, `createLedgerEntry(data)`, `deleteLedgerEntry(id)`
— thin `apiClient` wrappers; the response interceptor unwraps `data`.

### Store — `useClinicalStore`
- Replace in-memory `addAccount` with API-backed **`addLedgerEntry(entry)`**: POST,
  then prepend the normalized returned row to `clinicAccounts`.
- Add **`loadLedger()`**: GET `/api/ledger`, normalize each row to the existing
  account-entry shape (`{ id, date, type, category, description, amount, patientId }`)
  and merge into `clinicAccounts` (filter-then-append, same pattern as
  `loadClinicPayments`).
- Finance page keeps merging `payments` + ledger; the unified `clinicAccounts` view
  is unchanged — manual entries now persist and reload.

### `AddEntrySheet`
- Submit calls `addLedgerEntry({ type, category, description, amount, entryDate })`
  instead of `addAccount(...)`.
- **Remove the dead mic** (`mic onMic={...}`) → closes #12.
- Keep optimistic UX: show toast + close on success; on failure show a real error.

## 4. Testing & verification

- **Backend:** unit test for `createLedgerEntry` validator (valid/invalid shapes)
  in the existing jest style; run full suite (must stay green).
- **Frontend:** `next build` must pass.
- **Migration:** apply `021_ledger_entries.sql` to live DB (additive/idempotent).
- **Manual smoke (read-only where possible):** confirm `/api/ledger` GET returns
  `{ ledgerEntries: [] }` (or the enveloped equivalent) for a clinic; do not write
  test rows to the shared DB without explicit approval.

## Risks / notes

- Writing to the shared production DB in automated tests is disallowed; verification
  of the create path is via validator unit tests + the live GET, not live inserts.
- `category` free-text means the app is the only guard on allowed categories; that's
  intentional (the form constrains the choices; the API stays flexible).
