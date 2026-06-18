# Ledger Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist manual income/expense entries to a new `ledger_entries` table via a clinic-scoped CRUD endpoint, wire `AddEntrySheet` to it, and remove its dead voice mic (#11 + #12).

**Architecture:** New `ledger_entries` table holds ONLY manual income/expense, complementing the existing `payments` table (patient collections, untouched). Backend follows the existing `base-clinic.repository` + zod-validator + response-envelope patterns. The finance screen keeps merging `payments` + ledger into its unified `clinicAccounts` view; the only change is that manual entries now persist and reload.

**Tech Stack:** Node/Express (CommonJS), Supabase (Postgres), zod validators, Next.js 16 frontend, zustand store, axios `apiClient`, jest.

## Global Constraints

- Backend is **CommonJS** (`require`/`module.exports`).
- Multi-tenancy boundary is **`clinic_id`**; scope strictly via `base-clinic.repository` (never OR in `dentist_id` when clinic context exists).
- All endpoints emit the standard envelope `{ success, data }` / `{ success, error }` via the `responseEnvelope` middleware; the frontend interceptor unwraps `data`.
- Soft delete uses the **`deleted_at IS NULL`** convention (the repository's `softDeleteColumn: 'deleted_at'`).
- Migrations are **idempotent** (`IF NOT EXISTS`). They are normally run in the Supabase SQL Editor; here we apply via `psql "$DATABASE_URL"` (available in `backend/.env`).
- Code is on branch `fix/pilot-issues-batch`. Do **not** write test rows to the shared production DB without explicit approval — verify the create path via validator unit tests + a live read-only GET.
- Frontend: this is a customized Next.js — do not introduce new Next APIs; match surrounding plain-React/zustand style.

---

### Task 1: Create and apply migration `021_ledger_entries.sql`

**Files:**
- Create: `backend/migrations/021_ledger_entries.sql`

**Interfaces:**
- Produces: table `public.ledger_entries` with columns `id, clinic_id, type, category, description, amount, entry_date, patient_id, lab_case_id, created_by, deleted_at, deleted_by, created_at, updated_at` and a partial index on `(clinic_id, entry_date DESC) WHERE deleted_at IS NULL`.

- [ ] **Step 1: Write the migration file**

```sql
-- 021_ledger_entries.sql
-- Persistent manual income/expense ledger for the finance section (#11).
-- Complements `payments` (patient collections) — this table holds ONLY manually
-- entered income/expense (rent, salary, supplies, lab costs, misc income).
-- Idempotent; additive (new empty table, touches no existing data).

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
  ON public.ledger_entries (clinic_id, entry_date DESC)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Apply to the live DB**

Run from `backend/`:
```bash
DB=$(grep -E '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//' | tr -d '"'"'"'') && psql "$DB" -f migrations/021_ledger_entries.sql
```
Expected: `CREATE TABLE` then `CREATE INDEX` (or no error on re-run).

- [ ] **Step 3: Verify the table exists with the right columns**

Run from `backend/`:
```bash
DB=$(grep -E '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//' | tr -d '"'"'"'') && psql "$DB" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='ledger_entries' ORDER BY ordinal_position;"
```
Expected: lists all 14 columns above.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/021_ledger_entries.sql
git commit -m "feat(db): ledger_entries table for persistent income/expense (#11)"
```

---

### Task 2: Add ledger validators + unit test

**Files:**
- Modify: `backend/src/validators/index.js` (add `createLedgerEntry`, `updateLedgerEntry`, export both; near the Payments block ~line 134)
- Test: `backend/tests/validators.test.js` (add a `describe`/`test` block)

**Interfaces:**
- Produces: `v.createLedgerEntry` and `v.updateLedgerEntry` zod schemas.
  - `createLedgerEntry` shape: `{ type: 'income'|'expense' (required), category: string min1 (required), description?: string|null, amount: number>=0 coerced (required), entryDate?: string|null, patientId?: uuid|null, labCaseId?: uuid|null }`. Unknown keys stripped.
  - `updateLedgerEntry` = `createLedgerEntry.partial()`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/validators.test.js` inside the `describe('validators', ...)` block:
```js
  test('createLedgerEntry: requires type+category+amount, coerces amount, strips unknowns', () => {
    const uid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const ok = v.createLedgerEntry.safeParse({ type: 'expense', category: 'Rent', amount: '15000', evil: 'x' });
    expect(ok.success).toBe(true);
    expect(ok.data.amount).toBe(15000);     // coerced number
    expect('evil' in ok.data).toBe(false);  // stripped

    expect(v.createLedgerEntry.safeParse({ type: 'bogus', category: 'Rent', amount: 1 }).success).toBe(false); // bad enum
    expect(v.createLedgerEntry.safeParse({ type: 'income', amount: 1 }).success).toBe(false);                  // no category
    expect(v.createLedgerEntry.safeParse({ type: 'income', category: 'X', amount: -5 }).success).toBe(false);  // negative
    expect(v.createLedgerEntry.safeParse({ type: 'income', category: 'X', amount: 1, patientId: 'nope' }).success).toBe(false); // bad uuid
    expect(v.createLedgerEntry.safeParse({ type: 'income', category: 'X', amount: 1, patientId: uid }).success).toBe(true);
  });

  test('updateLedgerEntry: all fields optional (partial)', () => {
    expect(v.updateLedgerEntry.safeParse({}).success).toBe(true);
    expect(v.updateLedgerEntry.safeParse({ amount: '200' }).data.amount).toBe(200);
    expect(v.updateLedgerEntry.safeParse({ type: 'nope' }).success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `npx jest validators -t "Ledger" 2>&1 | tail -15` (or run the whole file).
Expected: FAIL — `v.createLedgerEntry` is undefined (`Cannot read properties of undefined (reading 'safeParse')`).

- [ ] **Step 3: Add the validators**

In `backend/src/validators/index.js`, after the `recordPayment` schema (the `// ── Payments ──` block), add:
```js
// ── Ledger (manual income/expense — separate from patient payments) ─────────
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
Then add `createLedgerEntry, updateLedgerEntry,` to the `module.exports = { ... }` object (e.g. right after `recordPayment,`).

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `npx jest validators 2>&1 | tail -8`
Expected: PASS (all validator tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/index.js backend/tests/validators.test.js
git commit -m "feat(api): ledger entry validators + tests (#11)"
```

---

### Task 3: Add repository + controller + routes, mount in server

**Files:**
- Modify: `backend/src/repositories/index.js` (add `ledger` instance)
- Create: `backend/src/controllers/ledger.controller.js`
- Create: `backend/src/routes/ledger.routes.js`
- Modify: `backend/src/server.js` (mount the route)

**Interfaces:**
- Consumes: `v.createLedgerEntry`, `v.updateLedgerEntry` (Task 2); `repos.ledger` (this task).
- Produces:
  - `repos.ledger` — a `BaseClinicRepository('ledger_entries', { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'entry_date', ascending: false } })`.
  - REST endpoints under `/api/ledger`: `GET /` → `{ ledgerEntries: [...] }`; `POST /` → `{ entry }` (201); `PUT /:id` → `{ entry }`; `DELETE /:id` → `{ success: true }`.

- [ ] **Step 1: Add the repository instance**

In `backend/src/repositories/index.js`, add to the `module.exports` object (after the `payments` line):
```js
  ledger:         new Base('ledger_entries',   { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'entry_date', ascending: false } }),
```

- [ ] **Step 2: Write the controller**

Create `backend/src/controllers/ledger.controller.js`:
```js
const repos = require('../repositories');

function scopeOf(req) {
  return { clinicId: req.clinicId, dentistId: req.dentistId };
}

// GET /api/ledger — clinic-scoped manual income/expense entries.
// Optional filters: ?type=income|expense, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD
exports.list = async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    let q = repos.ledger.query(scopeOf(req)).order('entry_date', { ascending: false });
    if (type) q = q.eq('type', type);
    if (from) q = q.gte('entry_date', from);
    if (to)   q = q.lte('entry_date', to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ledgerEntries: data || [] });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { type, category, description, amount, entryDate, patientId, labCaseId } = req.body;
    const entry = await repos.ledger.create({
      clinic_id: req.clinicId,
      created_by: req.staffId || null,
      type, category,
      description: description || null,
      amount,
      entry_date: entryDate || new Date().toISOString().split('T')[0],
      patient_id: patientId || null,
      lab_case_id: labCaseId || null,
    });
    res.status(201).json({ entry });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const map = { entryDate: 'entry_date', patientId: 'patient_id', labCaseId: 'lab_case_id' };
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, val] of Object.entries(req.body)) updates[map[k] || k] = val;
    delete updates.clinic_id; delete updates.id; delete updates.created_by;
    const entry = await repos.ledger.update(req.params.id, scopeOf(req), updates);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    await repos.ledger.softDelete(req.params.id, scopeOf(req), req.staffId);
    res.json({ success: true });
  } catch (e) { next(e); }
};
```

- [ ] **Step 3: Write the route**

Create `backend/src/routes/ledger.routes.js`:
```js
const router = require('express').Router();
const ctrl = require('../controllers/ledger.controller');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(auth);
router.use(requireClinic); // manual ledger is strictly clinic-scoped
router.get('/', ctrl.list);
router.post('/', validate(v.createLedgerEntry), ctrl.create);
router.put('/:id', validate(v.updateLedgerEntry), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
```

- [ ] **Step 4: Mount the route in server.js**

In `backend/src/server.js`, add alongside the other `app.use('/api/...', require(...))` lines (e.g. after the payments route mount):
```js
app.use('/api/ledger', require('./routes/ledger.routes'));
```

- [ ] **Step 5: Verify the server loads and the full suite stays green**

Run from `backend/`:
```bash
node -e "require('dotenv').config(); require('./src/server.js'); setTimeout(()=>{console.log('server module loaded OK'); process.exit(0)}, 800);" 2>&1 | tail -3
npx jest --silent 2>&1 | tail -5
```
Expected: server loads without throwing; `Tests: <N> passed` (no failures).

> Confirmed: `backend/src/middleware/requireClinic.js` does `module.exports = (req,res,next) => {...}` (default-exported middleware), so `const requireClinic = require('../middleware/requireClinic')` is correct as written.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/index.js backend/src/controllers/ledger.controller.js backend/src/routes/ledger.routes.js backend/src/server.js
git commit -m "feat(api): /api/ledger CRUD endpoint (#11)"
```

---

### Task 4: Frontend service + store wiring

**Files:**
- Create: `dentai-app/lib/services/ledger.service.js`
- Modify: `dentai-app/store/useClinicalStore.js` (replace `addAccount`, add `loadLedger`)

**Interfaces:**
- Consumes: `/api/ledger` endpoints (Task 3); `apiClient` (unwraps `data`).
- Produces:
  - `ledger.service`: `listLedger({ type, from, to })` → `{ ledgerEntries }`; `createLedgerEntry(data)` → `{ entry }`; `deleteLedgerEntry(id)` → `true`.
  - store: `addLedgerEntry(entry)` (async, POSTs then prepends normalized row to `clinicAccounts`, returns the row); `loadLedger()` (GETs, normalizes, merges into `clinicAccounts`). Normalized account-entry shape: `{ id, date, type, category, description, amount, patientId }`.

- [ ] **Step 1: Write the service**

Create `dentai-app/lib/services/ledger.service.js`:
```js
import { apiClient } from '../api/client';

export async function listLedger({ type, from, to } = {}) {
  const params = {};
  if (type) params.type = type;
  if (from) params.from = from;
  if (to) params.to = to;
  const { data } = await apiClient.get('/api/ledger', { params });
  return data; // { ledgerEntries: [...] }
}

export async function createLedgerEntry(entry) {
  const { data } = await apiClient.post('/api/ledger', entry);
  return data; // { entry }
}

export async function deleteLedgerEntry(id) {
  await apiClient.delete(`/api/ledger/${id}`);
  return true;
}
```

- [ ] **Step 2: Add a normalizer + wire the store**

In `dentai-app/store/useClinicalStore.js`:

(a) Add the import near the top (with the other service imports):
```js
import { listLedger, createLedgerEntry, deleteLedgerEntry } from '@/lib/services/ledger.service';
```

(b) Add a normalizer near `normRx` (bottom of file):
```js
function normLedger(r) {
  return {
    id: r.id,
    date: (r.entry_date || r.entryDate || r.created_at || '').slice(0, 10),
    type: r.type || 'expense',
    category: r.category || 'Other',
    description: r.description || r.category || '',
    amount: parseFloat(r.amount) || 0,
    patientId: r.patient_id || r.patientId || null,
  };
}
```

(c) Replace the in-memory `addAccount` (the `/* ─── Clinic accounts / ledger (local-only) ─── */` block, `addAccount: (a) => set(...)`) with API-backed methods:
```js
  /* ─── Clinic accounts / ledger (API-backed) ─── */
  loadLedger: async () => {
    try {
      const { ledgerEntries } = await listLedger();
      const entries = (ledgerEntries || []).map(normLedger);
      set((s) => ({
        // keep payment-derived entries (they have a category from loadClinicPayments),
        // replace only the manually-entered ledger rows on reload.
        clinicAccounts: [
          ...entries,
          ...s.clinicAccounts.filter((a) => !entries.some((e) => e.id === a.id)),
        ],
      }));
    } catch (e) {
      console.warn('[ClinicalStore] loadLedger failed', e?.response?.status);
    }
  },

  addLedgerEntry: async (entry) => {
    const { entry: row } = await createLedgerEntry(entry);
    const norm = normLedger(row);
    set((s) => ({ clinicAccounts: [norm, ...s.clinicAccounts] }));
    return norm;
  },

  removeLedgerEntry: async (id) => {
    const prev = get().clinicAccounts;
    set((s) => ({ clinicAccounts: s.clinicAccounts.filter((a) => a.id !== id) }));
    try { await deleteLedgerEntry(id); }
    catch (e) { set({ clinicAccounts: prev }); throw e; }
  },
```

> If any other source still calls `addAccount`, search and update: `grep -rn "addAccount" dentai-app/app dentai-app/components --include='*.jsx'`. As of this plan only `AddEntrySheet` uses it (rewired in Task 5).

- [ ] **Step 3: Verify the store still compiles via build (deferred to Task 5 build)**

No standalone check here; the JSX build in Task 5 covers it. (zustand store is plain JS but imported by client components compiled by `next build`.)

- [ ] **Step 4: Commit**

```bash
git add dentai-app/lib/services/ledger.service.js dentai-app/store/useClinicalStore.js
git commit -m "feat(web): ledger service + API-backed store methods (#11)"
```

---

### Task 5: Wire AddEntrySheet to persist + remove dead mic, verify build

**Files:**
- Modify: `dentai-app/components/sheets/AddEntrySheet.jsx`

**Interfaces:**
- Consumes: `addLedgerEntry` from `useClinicalStore` (Task 4).

- [ ] **Step 1: Rewrite the sheet's submit + remove the mic**

In `dentai-app/components/sheets/AddEntrySheet.jsx`:

(a) Swap the store selector:
```js
  const addLedgerEntry = useClinicalStore((s) => s.addLedgerEntry);
```
(remove the `const addAccount = useClinicalStore((s) => s.addAccount);` line.)

(b) Remove the dead mic on the Description field (#12) — change the line to:
```js
        <Field label="Description" value={desc} onChange={setDesc} placeholder="What was this for?" />
```

(c) Make submit async + persisting. Replace the `PrimaryButton` onClick with:
```js
      <PrimaryButton onClick={async () => {
        if (!amount || (parseFloat(amount) || 0) <= 0) { showToast('Enter an amount'); return; }
        try {
          await addLedgerEntry({
            type,
            category: cat,
            description: desc || cat,
            amount: parseFloat(amount) || 0,
          });
          showToast('Entry added');
          onClose();
        } catch (e) {
          showToast(e?.apiError?.message || e?.message || 'Could not save entry');
        }
      }}>Add {type === 'income' ? 'income' : 'expense'}</PrimaryButton>
```
(`TODAY` import may now be unused — remove it from the import line if so.)

- [ ] **Step 2: Verify the frontend builds**

Run from `dentai-app/`: `npx next build 2>&1 | tail -20`
Expected: `✓ Compiled successfully`, TypeScript passes, all pages generated, no errors referencing AddEntrySheet / useClinicalStore / ledger.service.

- [ ] **Step 3: Read-only live smoke of the GET endpoint (no writes)**

This needs a valid token; if not readily available, skip and rely on the build. If a token is on hand, from `backend/` with the server running:
```bash
# expects HTTP 200 and {"success":true,"data":{"ledgerEntries":[...]}}
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:10000/api/ledger | head -c 300
```
Expected: enveloped JSON with a `ledgerEntries` array (empty is fine). Do NOT POST a test row to the shared DB without approval.

- [ ] **Step 4: Commit**

```bash
git add dentai-app/components/sheets/AddEntrySheet.jsx
git commit -m "feat(web): persist finance entries via /api/ledger + drop dead mic (#11, #12)"
```

---

## Self-Review

**Spec coverage:**
- Migration `021` + apply to live → Task 1. ✓
- Repository + controller + routes + server mount → Task 3. ✓
- Validators → Task 2. ✓
- Service + store (`addLedgerEntry`/`loadLedger`) → Task 4. ✓
- AddEntrySheet wiring + mic removal (#12) → Task 5. ✓
- Testing (validator unit test, full jest, next build, live GET smoke) → Tasks 2/3/5. ✓
- "Separate table, keep merging" → store keeps `clinicAccounts` merged (Task 4). ✓
- "Match current shape" fields → migration + validator + controller all use type/category/description/amount/entry_date/patient_id/lab_case_id. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The two advisory notes (confirm `requireClinic` export; `grep addAccount`) are verification guardrails, not deferred work. ✓

**Type consistency:** `ledgerEntries` response key used consistently (controller → service → store). `normLedger` output shape matches the existing account-entry shape consumed by the finance page (`{ id, date, type, category, description, amount, patientId }`). `entry` (singular) is the create/update response key in controller + store. Field name map (`entryDate→entry_date`, `patientId→patient_id`, `labCaseId→lab_case_id`) consistent between validator (camelCase) and controller (snake_case row). ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-ledger-entries.md`.
