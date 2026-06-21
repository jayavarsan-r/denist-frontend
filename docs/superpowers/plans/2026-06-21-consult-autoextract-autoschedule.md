# Consult Auto-Extract + Availability-Aware Auto-Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI extract diagnosis, number of sittings, and treatment amount from the consultation transcript, pre-fill them on the verification card, and on confirm auto-schedule the next appointment(s) onto real free slots inside the clinic's configured working hours — identically for the queue and patient-profile consults.

**Architecture:** Three new nullable fields are added to the existing Gemini extraction schema; a cost fallback derives the amount from the procedure catalog when unspoken. The frontend mapping stops hardcoding sittings/cost. The existing `confirmConsultationDraft` scheduler is upgraded to read `clinics.open_time/close_time/working_days` fresh per confirm and skip closed days, with the pure slot/day math factored into a dependency-free util for testing. The patient-profile confirm is routed through the same orchestrator. Onboarding is fixed to actually persist the hours it already collects.

**Tech Stack:** Node.js + Express + supabase-js + Zod + Gemini (backend, Jest tests); Next.js (App Router) + Zustand (frontend, no test runner — verified via Node ESM check + build + manual smoke).

## Global Constraints

- **New extracted fields are nullable** — the model returns `null` when the dentist didn't state the value; never guess. Copy verbatim into Zod, the Gemini response schema, and the prompt.
- **Learning-loop cleanliness:** the cost fallback is a derived value written onto `extracted`, NOT a correction. An untouched confirm must still produce zero corrections (`computeCorrections(draft.extracted, confirmedData)` === `{}`).
- **Sunday encoding:** `working_days` is an int array; Sunday appears as `0` (legacy onboarding UI) OR `7` (Settings UI). All day logic must accept both.
- **Scheduler fallback hours:** open 10:00, close 18:00, working_days `[1,2,3,4,5,6]` when the clinic row has nulls. Read clinic hours fresh on each confirm (no caching = "auto-refresh").
- **No new API endpoint** — `PATCH /api/clinic` and validator already accept `openTime`/`closeTime`/`workingDays`; `confirmedDataSchema` already passes `total_sittings`/`estimated_cost`/`diagnosis` through.
- **Frontend:** this is a modified Next.js — per `dentai-app/AGENTS.md`, do not assume vanilla Next.js APIs; follow existing patterns in the files you edit.
- **Backend tests:** Jest, flat files in `backend/tests/`, `require('../src/...')`. Keep pure helpers free of `supabase`/`gemini.provider` imports so tests need no env/mocks.

---

### Task 1: Extract diagnosis / total_sittings / estimated_cost

**Files:**
- Modify: `backend/src/services/gemini-extraction.service.js` (`DraftSchema`, `GEMINI_DRAFT_SCHEMA`, `SYSTEM`, salvage block in `extractFromTranscript`)
- Test: `backend/tests/consult-extraction.test.js` (create)

**Interfaces:**
- Produces: `DraftSchema` now validates top-level `diagnosis: string|null`, `total_sittings: int>0|null`, `estimated_cost: number>=0|null`. Exported unchanged via `module.exports.DraftSchema`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/consult-extraction.test.js`:

```js
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const { DraftSchema } = require('../src/services/gemini-extraction.service');

describe('DraftSchema — diagnosis / sittings / cost', () => {
  test('parses the three new fields when present', () => {
    const r = DraftSchema.safeParse({
      treatments: [], prescriptions: [], clinical_notes: 'RCT done', unclear_spans: [],
      diagnosis: 'Irreversible pulpitis', total_sittings: 3, estimated_cost: 4500,
    });
    expect(r.success).toBe(true);
    expect(r.data.diagnosis).toBe('Irreversible pulpitis');
    expect(r.data.total_sittings).toBe(3);
    expect(r.data.estimated_cost).toBe(4500);
  });

  test('defaults the three new fields to null when omitted', () => {
    const r = DraftSchema.safeParse({
      treatments: [], prescriptions: [], clinical_notes: null, unclear_spans: [],
    });
    expect(r.success).toBe(true);
    expect(r.data.diagnosis).toBeNull();
    expect(r.data.total_sittings).toBeNull();
    expect(r.data.estimated_cost).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/consult-extraction.test.js`
Expected: FAIL — the "present" case may pass via passthrough, but `r.data.diagnosis`/`total_sittings`/`estimated_cost` are `undefined` (not on the schema), so assertions fail.

- [ ] **Step 3: Add the fields to `DraftSchema`**

In `backend/src/services/gemini-extraction.service.js`, change the tail of `DraftSchema` (currently `clinical_notes` then `unclear_spans`):

```js
  clinical_notes: z.string().nullable().default(null),
  diagnosis:      z.string().nullable().default(null),
  total_sittings: z.number().int().positive().nullable().default(null),
  estimated_cost: z.number().nonnegative().nullable().default(null),
  unclear_spans:  z.array(z.string()).default([]),
});
```

- [ ] **Step 4: Add the fields to `GEMINI_DRAFT_SCHEMA`**

In the same file, change the tail of `GEMINI_DRAFT_SCHEMA.properties` (currently `clinical_notes` then `unclear_spans`):

```js
    clinical_notes: { type: 'STRING', nullable: true },
    diagnosis:      { type: 'STRING', nullable: true },
    total_sittings: { type: 'INTEGER', nullable: true },
    estimated_cost: { type: 'NUMBER', nullable: true },
    unclear_spans:  { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['treatments', 'prescriptions', 'clinical_notes', 'unclear_spans'],
};
```

(Leave `required` unchanged — the new fields stay optional/nullable.)

- [ ] **Step 5: Add prompt rules + schema keys to `SYSTEM`**

In `SYSTEM`, replace rule line `8. Return ONLY valid JSON matching the schema below. No markdown fences, no explanation.` with:

```
8. diagnosis: the condition the dentist STATES (translate to English). Never invent a diagnosis — null if the dentist did not state one. This is the condition, NOT the procedure performed.
9. total_sittings: if the dentist says how many total sittings the treatment needs, put that number. null otherwise.
10. estimated_cost: if the dentist states a price/fee/amount, put the plain number (₹ assumed). null otherwise. Do NOT infer from any catalog — the code handles that.
11. Return ONLY valid JSON matching the schema below. No markdown fences, no explanation.
```

Then in the `OUTPUT SCHEMA:` JSON block, replace the `"clinical_notes": ...` line + the `"unclear_spans": ["..."]` line with:

```
  "clinical_notes": "verbatim English summary of what was done, or null",
  "diagnosis": "the condition the dentist stated, in English, or null",
  "total_sittings": number_or_null,
  "estimated_cost": number_or_null,
  "unclear_spans": ["..."]
```

- [ ] **Step 6: Add the fields to the salvage object**

In `extractFromTranscript`, the `const salvage = DraftSchema.parse({ ... })` object: add the three fields alongside `clinical_notes`:

```js
    clinical_notes: typeof parsed.clinical_notes === 'string' ? parsed.clinical_notes : null,
    diagnosis:      typeof parsed.diagnosis === 'string' ? parsed.diagnosis : null,
    total_sittings: Number.isInteger(parsed.total_sittings) && parsed.total_sittings > 0 ? parsed.total_sittings : null,
    estimated_cost: typeof parsed.estimated_cost === 'number' && parsed.estimated_cost >= 0 ? parsed.estimated_cost : null,
    unclear_spans:  Array.isArray(parsed.unclear_spans) ? parsed.unclear_spans.filter((s) => typeof s === 'string') : [],
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx jest tests/consult-extraction.test.js`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/gemini-extraction.service.js backend/tests/consult-extraction.test.js
git commit -m "feat(ai): extract diagnosis, total_sittings, estimated_cost from transcript"
```

---

### Task 2: Cost fallback (catalog default × sittings)

**Files:**
- Modify: `backend/src/services/gemini-extraction.service.js` (add + export `applyCostFallback`)
- Modify: `backend/src/workers/voice.worker.js` (import + call after extraction)
- Test: `backend/tests/consult-extraction.test.js` (extend)

**Interfaces:**
- Consumes: `DraftSchema`-shaped `extracted`, `ctx.procedureCatalog` (`[{ name, code, default_sittings, default_fee }]` from `consultation-context.service`).
- Produces: `applyCostFallback(extracted, procedureCatalog) -> extracted` (mutates in place; sets `estimated_cost` when it was null and a catalog code matched).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/consult-extraction.test.js`:

```js
const { applyCostFallback } = require('../src/services/gemini-extraction.service');

describe('applyCostFallback', () => {
  const catalog = [{ code: 'RCT', default_fee: 3000 }, { code: 'CRWN', default_fee: 5000 }];

  test('leaves a stated cost untouched', () => {
    const ex = { estimated_cost: 4500, total_sittings: 3, treatments: [{ procedure_code: 'RCT' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(4500);
  });

  test('derives fee x sittings when cost is null and a code matches', () => {
    const ex = { estimated_cost: null, total_sittings: 3, treatments: [{ procedure_code: 'RCT' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(9000); // 3000 x 3
  });

  test('defaults sittings to 1 when null', () => {
    const ex = { estimated_cost: null, total_sittings: null, treatments: [{ procedure_code: 'CRWN' }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBe(5000);
  });

  test('stays null when no catalog code matches', () => {
    const ex = { estimated_cost: null, total_sittings: 2, treatments: [{ procedure_code: null }] };
    applyCostFallback(ex, catalog);
    expect(ex.estimated_cost).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/consult-extraction.test.js`
Expected: FAIL — `applyCostFallback is not a function`.

- [ ] **Step 3: Implement `applyCostFallback` and export it**

In `backend/src/services/gemini-extraction.service.js`, add before `module.exports`:

```js
// Derive a cost when the dentist didn't state one: sum the matched procedure-catalog
// default fees and multiply by the sitting count. Mutates + returns `extracted`. This
// is a DERIVED value, not a correction — it lives on `extracted` so an untouched
// confirm produces no spurious diff in the few-shot learning loop.
function applyCostFallback(extracted, procedureCatalog = []) {
  if (!extracted || extracted.estimated_cost != null) return extracted;
  const codes = new Set((extracted.treatments || []).map((t) => t.procedure_code).filter(Boolean));
  if (!codes.size || !Array.isArray(procedureCatalog) || !procedureCatalog.length) return extracted;
  let fee = 0;
  for (const p of procedureCatalog) {
    if (codes.has(p.code) && p.default_fee != null) fee += Number(p.default_fee) || 0;
  }
  if (fee > 0) extracted.estimated_cost = fee * (extracted.total_sittings || 1);
  return extracted;
}
```

Change the export line to include it:

```js
module.exports = { extractFromTranscript, applyCostFallback, DraftSchema, buildPrompt, SYSTEM };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/consult-extraction.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire it into the worker**

In `backend/src/workers/voice.worker.js`, change the import (line 9) from:

```js
const { extractFromTranscript } = require('../services/gemini-extraction.service');
```
to:
```js
const { extractFromTranscript, applyCostFallback } = require('../services/gemini-extraction.service');
```

Then immediately after the `extractFromTranscript` destructure call (right after the `const { data: extracted, lowConfidence, ... } = await extractFromTranscript(transcript, ctx);` line), add:

```js
    // Fill in a cost the dentist didn't state, from the clinic procedure catalog.
    applyCostFallback(extracted, ctx.procedureCatalog);
```

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd backend && npx jest`
Expected: PASS (all existing suites + the new one).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/gemini-extraction.service.js backend/src/workers/voice.worker.js backend/tests/consult-extraction.test.js
git commit -m "feat(ai): fall back to catalog fee x sittings when cost unspoken"
```

---

### Task 3: Availability-aware scheduling (clinic hours + closed-day skip)

**Files:**
- Create: `backend/src/utils/scheduling.js`
- Test: `backend/tests/scheduling.test.js` (create)
- Modify: `backend/src/services/transaction.service.js` (`firstFreeTime`, add `loadClinicHours`, date loop in `confirmConsultationDraft`)

**Interfaces:**
- Produces (pure util): `isWorkingDay(date, workingDays) -> bool`; `nextWorkingDay(date, workingDays) -> Date`; `pickSlot(bookedRanges, openMin, closeMin, durationMins, alreadyPickedMins) -> startMin`; plus `toMin`/`toHHMM`.
- Consumes: `transaction.service` calls these + a new local `loadClinicHours(clinicId) -> { openMin, closeMin, workingDays }`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/scheduling.test.js`:

```js
const { isWorkingDay, nextWorkingDay, pickSlot } = require('../src/utils/scheduling');

// 2026-06-21 is a Sunday; 2026-06-22 is a Monday.
const sunday = new Date('2026-06-21T00:00:00');
const monday = new Date('2026-06-22T00:00:00');

describe('isWorkingDay', () => {
  test('weekday in set is working', () => {
    expect(isWorkingDay(monday, [1, 2, 3, 4, 5, 6])).toBe(true);
  });
  test('Sunday excluded when set uses neither 0 nor 7', () => {
    expect(isWorkingDay(sunday, [1, 2, 3, 4, 5, 6])).toBe(false);
  });
  test('Sunday accepted whether encoded as 7 or 0', () => {
    expect(isWorkingDay(sunday, [1, 7])).toBe(true);
    expect(isWorkingDay(sunday, [0, 1])).toBe(true);
  });
});

describe('nextWorkingDay', () => {
  test('rolls Sunday forward to Monday when Sunday is closed', () => {
    const d = nextWorkingDay(sunday, [1, 2, 3, 4, 5, 6]);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-22');
  });
  test('keeps a date that is already a working day', () => {
    const d = nextWorkingDay(monday, [1, 2, 3, 4, 5, 6]);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-22');
  });
});

describe('pickSlot', () => {
  const open = 10 * 60, close = 18 * 60; // 600..1080
  test('empty day returns the open minute', () => {
    expect(pickSlot([], open, close, 30, [])).toBe(600);
  });
  test('skips a booked first slot', () => {
    expect(pickSlot([[600, 630]], open, close, 30, [])).toBe(630);
  });
  test('avoids minutes already picked this confirm', () => {
    expect(pickSlot([], open, close, 30, [600])).toBe(630);
  });
  test('falls back to open when the day is full', () => {
    const allBooked = [[open, close]];
    expect(pickSlot(allBooked, open, close, 30, [])).toBe(600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/scheduling.test.js`
Expected: FAIL — `Cannot find module '../src/utils/scheduling'`.

- [ ] **Step 3: Create the pure util**

Create `backend/src/utils/scheduling.js`:

```js
// Pure scheduling helpers — no DB, no env. Clinic working-hours + free-slot math.
// working_days is an int array; Sunday is accepted as BOTH 0 and 7 because the
// onboarding UI historically stored Sunday as 0 while Settings stores it as 7.

const toMin = (hhmm) => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function isWorkingDay(date, workingDays) {
  const set = new Set((workingDays || []).map(Number));
  if (!set.size) return true;
  const js = date.getDay(); // 0=Sun..6=Sat
  const cands = js === 0 ? [0, 7] : [js];
  return cands.some((d) => set.has(d));
}

// Roll `date` forward (up to 14 days) to the next working day. Returns a new Date.
function nextWorkingDay(date, workingDays) {
  const d = new Date(date);
  for (let i = 0; i < 14; i++) {
    if (isWorkingDay(d, workingDays)) return d;
    d.setDate(d.getDate() + 1);
  }
  return new Date(date);
}

// First free 30-min-aligned start minute in [openMin, closeMin) that doesn't clash
// with bookedRanges ([startMin, endMin]) or alreadyPickedMins. Falls back to openMin.
function pickSlot(bookedRanges, openMin, closeMin, durationMins = 30, alreadyPickedMins = []) {
  const booked = [
    ...(bookedRanges || []),
    ...(alreadyPickedMins || []).map((s) => [s, s + durationMins]),
  ];
  for (let t = openMin; t + durationMins <= closeMin; t += 30) {
    const clash = booked.some(([s, e]) => t < e && t + durationMins > s);
    if (!clash) return t;
  }
  return openMin;
}

module.exports = { toMin, toHHMM, isWorkingDay, nextWorkingDay, pickSlot };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/scheduling.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire the util into `transaction.service.js`**

In `backend/src/services/transaction.service.js`:

(a) After the existing `const { badRequest } = require('../utils/errors');` import, add:

```js
const { isWorkingDay, nextWorkingDay, pickSlot } = require('../utils/scheduling');
```

(b) Replace the existing `firstFreeTime` function (the whole `async function firstFreeTime(...) { ... }`) with a clinic-hours-aware version + a hours loader. Keep the local `_toMin`/`_toHHMM` helpers above it as-is:

```js
// Resolve the clinic's working window + days, fresh on each confirm (no caching, so
// a Settings change is honoured immediately). Falls back to a sane default.
async function loadClinicHours(clinicId) {
  const def = { openMin: 10 * 60, closeMin: 18 * 60, workingDays: [1, 2, 3, 4, 5, 6] };
  try {
    const { data } = await supabase.from('clinics')
      .select('open_time, close_time, working_days').eq('id', clinicId).single();
    if (!data) return def;
    const openMin = data.open_time ? _toMin(data.open_time) : def.openMin;
    let closeMin = data.close_time ? _toMin(data.close_time) : def.closeMin;
    if (!(closeMin > openMin)) closeMin = def.closeMin;
    const wd = Array.isArray(data.working_days) && data.working_days.length
      ? data.working_days.map(Number) : def.workingDays;
    return { openMin, closeMin, workingDays: wd };
  } catch { return def; }
}

// Pick the first open, availability-checked 30-min slot on `date` inside the clinic
// window (`hours`), skipping booked appointments and times already picked this confirm.
async function firstFreeTime(clinicId, date, durationMins = 30, alreadyPicked = [], hours = null) {
  const openMin = hours?.openMin ?? 10 * 60;
  const closeMin = hours?.closeMin ?? 18 * 60;
  try {
    const { data: appts } = await supabase.from('appointments')
      .select('appointment_time, duration_minutes')
      .eq('clinic_id', clinicId).eq('appointment_date', date).neq('status', 'cancelled');
    const booked = (appts || []).filter((a) => a.appointment_time).map((a) => {
      const s = _toMin(a.appointment_time); return [s, s + (a.duration_minutes || 30)];
    });
    const pickedMins = alreadyPicked.map(_toMin);
    return _toHHMM(pickSlot(booked, openMin, closeMin, durationMins, pickedMins));
  } catch { return _toHHMM(openMin); }
}
```

(c) In `confirmConsultationDraft`, just before `const appointments = [];` (the comment block "3. Recommended appointments"), add:

```js
  const hours = await loadClinicHours(clinicId);
```

(d) Replace the sitting-dates loop and the follow-up push so each date rolls to a working day. Replace:

```js
  const remainingFrom = (plan.completed_sittings || 1);
  for (let i = remainingFrom + 1; i <= (plan.total_sittings || sittings); i++) {
    const d = new Date(); d.setDate(d.getDate() + (i - remainingFrom) * 7);
    plan_specs.push({ date: d.toISOString().split('T')[0], sitting: i, purpose: `${procedure} — Session ${i}` });
  }
  if (followUpDate && !plan_specs.some((s) => s.date === followUpDate)) {
    plan_specs.push({
      date: followUpDate,
      sitting: plan_specs.length + 2,
      purpose: followUpReason ? `Follow-up: ${followUpReason}` : `${procedure} — Follow-up`,
    });
  }
```

with:

```js
  const remainingFrom = (plan.completed_sittings || 1);
  for (let i = remainingFrom + 1; i <= (plan.total_sittings || sittings); i++) {
    const d = new Date(); d.setDate(d.getDate() + (i - remainingFrom) * 7);
    const wd = nextWorkingDay(d, hours.workingDays);
    plan_specs.push({ date: wd.toISOString().split('T')[0], sitting: i, purpose: `${procedure} — Session ${i}` });
  }
  if (followUpDate) {
    const fStr = nextWorkingDay(new Date(`${followUpDate}T00:00:00`), hours.workingDays).toISOString().split('T')[0];
    if (!plan_specs.some((s) => s.date === fStr)) {
      plan_specs.push({
        date: fStr,
        sitting: plan_specs.length + 2,
        purpose: followUpReason ? `Follow-up: ${followUpReason}` : `${procedure} — Follow-up`,
      });
    }
  }
```

(e) In the slot-assignment loop, pass `hours` to `firstFreeTime`. Replace:

```js
      const time = await firstFreeTime(clinicId, spec.date, 30, pickedByDate[spec.date] || []);
```
with:
```js
      const time = await firstFreeTime(clinicId, spec.date, 30, pickedByDate[spec.date] || [], hours);
```

> Note: `isWorkingDay` is imported for clarity/consumption by `nextWorkingDay`; if your linter flags it as unused in this file, drop it from the import line (keep `nextWorkingDay, pickSlot`).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd backend && npx jest`
Expected: PASS. (The `transaction.service` wiring is not unit-tested here — it needs Supabase; it is covered by the util tests + the manual integration check in Task 8.)

- [ ] **Step 7: Verify the live DB has the clinic-hours columns**

Run (from `backend/`, with prod env loaded as the app uses):
```bash
node -e "require('dotenv').config(); const s=require('./src/config/supabase'); s.from('clinics').select('id, open_time, close_time, working_days').limit(1).then(r=>console.log(r.error||r.data)).catch(e=>console.log('ERR',e.message))"
```
Expected: a row (or empty array) — NOT a "column does not exist" error. If it errors, stop and surface the schema-drift before relying on these columns.

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/scheduling.js backend/tests/scheduling.test.js backend/src/services/transaction.service.js
git commit -m "feat(scheduling): place suggested appts within clinic hours, skip closed days"
```

---

### Task 4: Frontend mapping — pre-fill the extracted fields

**Files:**
- Modify: `dentai-app/lib/voice/draftMapping.js` (`toFrontendExtraction`)

**Interfaces:**
- Consumes: `draft.extracted` now carries `diagnosis`, `total_sittings`, `estimated_cost` (Task 1).
- Produces: `ex.diagnosis`, `ex.totalSittings`, `ex.estimatedCost` reflect the extracted values; `toConfirmedData` already round-trips them (no change there).

- [ ] **Step 1: Write the failing verification check**

Run this dependency-free Node ESM check (the file imports nothing) BEFORE the change to confirm it fails:

```bash
cd dentai-app && node --input-type=module -e "
import { toFrontendExtraction, toConfirmedData } from './lib/voice/draftMapping.js';
const draft = { id:'d1', extracted: { treatments:[{procedure_name_span:'RCT',tooth_fdi:36,procedure_code:'RCT'}], prescriptions:[], diagnosis:'Irreversible pulpitis', total_sittings:3, estimated_cost:4500, follow_up:{in_days:7} } };
const ex = toFrontendExtraction(draft);
console.assert(ex.diagnosis==='Irreversible pulpitis','diagnosis '+ex.diagnosis);
console.assert(ex.totalSittings===3,'sittings '+ex.totalSittings);
console.assert(ex.estimatedCost===4500,'cost '+ex.estimatedCost);
const cd = toConfirmedData(ex);
console.assert(cd.total_sittings===3 && cd.estimated_cost===4500 && cd.diagnosis==='Irreversible pulpitis','roundtrip');
console.log('OK');
"
```
Expected: an `AssertionError` (diagnosis falls back to `clinical_notes`=undefined→'', sittings=1, cost=0).

- [ ] **Step 2: Update `toFrontendExtraction`**

In `dentai-app/lib/voice/draftMapping.js`, in the returned object of `toFrontendExtraction`, change:

```js
    diagnosis: x.clinical_notes || '',
```
to:
```js
    diagnosis: x.diagnosis || '',
```

and change:

```js
    totalSittings: 1,
    estimatedCost: 0,
```
to:
```js
    totalSittings: x.total_sittings ?? 1,
    estimatedCost: x.estimated_cost ?? 0,
```

- [ ] **Step 3: Run the verification check to confirm it passes**

Run the same Node command from Step 1.
Expected: prints `OK` with no AssertionError.

- [ ] **Step 4: Confirm an untouched draft still yields zero corrections (learning-loop guard)**

Run:
```bash
cd dentai-app && node --input-type=module -e "
import { toFrontendExtraction, toConfirmedData } from './lib/voice/draftMapping.js';
const extracted = { treatments:[{procedure_name_span:'RCT', procedure_code:'RCT', tooth_fdi:36, sitting_action:null, sitting_number:null, notes:null}], prescriptions:[], follow_up:{in_days:7, reason:null}, lab_case_suggestion:null, clinical_notes:'RCT done', diagnosis:'Pulpitis', total_sittings:3, estimated_cost:4500, unclear_spans:[] };
const cd = toConfirmedData(toFrontendExtraction({ id:'d1', extracted }));
console.log('total_sittings', cd.total_sittings, 'estimated_cost', cd.estimated_cost, 'diagnosis', cd.diagnosis);
console.assert(cd.total_sittings===3 && cd.estimated_cost===4500 && cd.diagnosis==='Pulpitis', 'round-trip must preserve values');
console.log('OK');
"
```
Expected: `OK` — values preserved (an untouched confirm sends back what was extracted, so `computeCorrections` finds nothing).

- [ ] **Step 5: Commit**

```bash
git add dentai-app/lib/voice/draftMapping.js
git commit -m "feat(web): pre-fill diagnosis, sittings, cost from AI extraction"
```

---

### Task 5: Unify the patient-profile confirm through the orchestrator (backend)

**Files:**
- Modify: `backend/src/controllers/voice.controller.js` (`reviewDraft`; remove now-unused requires)

**Interfaces:**
- Consumes: `transaction.confirmConsultationDraft({ clinicId, dentistId, staffId, requestId, queueId: null, draft, confirmedData })`.
- Produces: `PATCH /api/consultation-drafts/:id` with `status:'confirmed'` now creates plan + visit + appointments + prescription (same as the queue path); `status:'rejected'` still just sets status.

- [ ] **Step 1: Replace `reviewDraft`**

In `backend/src/controllers/voice.controller.js`, replace the entire `exports.reviewDraft = async (req, res, next) => { ... };` with:

```js
// PATCH /api/consultation-drafts/:id — the patient-profile consult confirm + reject.
// CONFIRM now runs the SAME orchestrator as the queue path (queueId=null), so the
// profile consult creates plan + visit + appointments + prescription identically —
// including availability-aware auto-scheduling. REJECT just sets the status.
exports.reviewDraft = async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { status, confirmed_data: confirmedData } = req.body;

    const { data: draft } = await supabase.from('consultation_drafts')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (!['pending_review', 'error'].includes(draft.status)) {
      return res.status(409).json({ error: 'draft_already_processed', status: draft.status });
    }

    if (status === 'rejected') {
      const { data: updated, error } = await supabase.from('consultation_drafts')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', draft.id).eq('clinic_id', req.clinicId)
        .select('id, status').single();
      if (error) throw error;
      return res.json({ draft: updated });
    }

    // status === 'confirmed' → full clinical write via the shared orchestrator.
    const transaction = require('../services/transaction.service');
    const result = await transaction.confirmConsultationDraft({
      clinicId: req.clinicId, dentistId: req.dentistId, staffId: req.staffId, requestId: req.id,
      queueId: null, draft, confirmedData: confirmedData || {},
    });
    res.json(result);
  } catch (e) {
    if (e.message === 'draft_already_processed' || e.status === 409) {
      return res.status(409).json({ error: 'draft_already_processed' });
    }
    next(e);
  }
};
```

- [ ] **Step 2: Remove now-unused requires**

At the top of `backend/src/controllers/voice.controller.js`, delete these three lines (they were only used by the old `reviewDraft`):

```js
const { computeCorrections } = require('../utils/draft-diff');
const logger = require('../utils/logger');
const sheets = require('../services/sheets-logger.service');
```

> Before deleting, confirm none are referenced elsewhere in the file:
> Run: `cd backend && grep -nE "computeCorrections|logger\.|sheets\." src/controllers/voice.controller.js`
> Expected after deletion target check: matches only inside the old `reviewDraft` you are replacing. If any appear in `startVoiceCore`/`startVoiceForQueue`/etc., keep that require.

- [ ] **Step 3: Verify the server still loads (no syntax / circular-require break)**

Run: `cd backend && node -e "require('./src/controllers/voice.controller'); console.log('loads OK')"`
Expected: prints `loads OK` (set `SUPABASE_URL`/`SUPABASE_ANON_KEY` env if it complains about supabase init — same as tests).

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/voice.controller.js
git commit -m "feat(api): route profile-consult confirm through shared orchestrator"
```

---

### Task 6: Frontend profile confirm — use the unified path (keep manual fallback)

**Files:**
- Modify: `dentai-app/components/sheets/PatientConsultSheet.jsx` (`confirmSave`)

**Interfaces:**
- Consumes: `reviewDraft(draftId, { status:'confirmed', confirmedData })` (now does the full server-side write).
- Behavior: when a voice draft exists (`ex._draftId`), one call does everything. When there is no draft (manual-typed / AI-error fallback via `blankExtraction()`), keep the legacy client-side `createVisit` + `createTreatmentPlan` + `saveRx`.

- [ ] **Step 1: Rewrite `confirmSave`**

In `dentai-app/components/sheets/PatientConsultSheet.jsx`, replace the body of `confirmSave` (the whole `const confirmSave = async () => { ... };`) with:

```js
  const confirmSave = async () => {
    const ex = extraction;
    if (!ex || completing) return;
    setCompleting(true);

    // VOICE PATH: a draft exists → one orchestrated server call creates plan + visit
    // + appointments (availability-scheduled) + Rx, exactly like the queue consult.
    if (ex._draftId) {
      try {
        await retryOnColdStart(() =>
          reviewDraft(ex._draftId, { status: 'confirmed', confirmedData: toConfirmedData(ex) }));
        refreshPatientData();
        showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
        onClose();
        return;
      } catch (e) {
        const msg = isNetworkError(e)
          ? "Couldn't reach the server — check your connection and try again"
          : (e?.apiError?.message || e?.message || 'Could not save — try again');
        showToast(msg);
        setCompleting(false);
        return;
      }
    }

    // MANUAL / AI-ERROR FALLBACK: no draft to orchestrate → legacy client-side writes.
    const teeth = Array.isArray(ex.teeth) && ex.teeth.length
      ? ex.teeth.map(String)
      : (ex.tooth ? [String(ex.tooth)] : []);
    const primaryTooth = teeth[0] || null;
    const followUpDate = /^\d{4}-\d{2}-\d{2}/.test(ex.followUp || '') ? ex.followUp : null;
    const medsText = (ex.medicines || [])
      .map((m) => [m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('; ');
    try {
      const visitRes = await retryOnColdStart(() => createVisit({
        patientId: p.id,
        procedureName: ex.procedure || 'Consultation',
        toothNumber: primaryTooth,
        notes: ex.diagnosis || '',
        medications: medsText || null,
        rawTranscript: ex.transcript || '',
        cost: ex.estimatedCost || null,
        followUpDate,
        status: 'completed',
      }));
      const visitId = visitRes?.visit?.id || null;

      if (ex.procedure) {
        try {
          await createTreatmentPlan({
            patientId: p.id, diagnosis: ex.diagnosis || '', procedureName: ex.procedure,
            totalSittings: ex.totalSittings || 1, estimatedCost: ex.estimatedCost || 0, notes: ex.instructions || '',
          });
        } catch { /* non-fatal */ }
      }

      if ((ex.medicines || []).length) {
        try {
          await saveRx({
            patientId: p.id, visitId, medicines: ex.medicines, instructions: ex.instructions || '',
            followUp: ex.followUp || '', rawVoice: ex.transcript || '',
          });
        } catch { /* non-fatal */ }
      }

      refreshPatientData();
      showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
      onClose();
    } catch (e) {
      const msg = isNetworkError(e)
        ? "Couldn't reach the server — check your connection and try again"
        : (e?.apiError?.message || e?.message || 'Could not save — try again');
      showToast(msg);
      setCompleting(false);
    }
  };
```

(Imports `createVisit`, `createTreatmentPlan`, `saveRx`, `reviewDraft`, `toConfirmedData`, `retryOnColdStart`, `isNetworkError` all already exist in this file — no import changes.)

- [ ] **Step 2: Lint the file**

Run: `cd dentai-app && npx eslint components/sheets/PatientConsultSheet.jsx`
Expected: no errors (warnings pre-existing in the repo are fine).

- [ ] **Step 3: Commit**

```bash
git add dentai-app/components/sheets/PatientConsultSheet.jsx
git commit -m "feat(web): profile consult confirm via unified orchestrator (manual fallback kept)"
```

---

### Task 7: Persist working hours captured at onboarding

**Files:**
- Modify: `dentai-app/app/doctor/setup/page.jsx` (`handleDone`; import `updateClinic`)

**Interfaces:**
- Consumes: `updateClinic({ openTime, closeTime, workingDays })` (`dentai-app/lib/services/clinic.service.js` — `PATCH /api/clinic`).
- Behavior: completing setup now persists the chosen open/close (first session) + working days to the `clinics` row (Sunday normalized 0→7), so the scheduler uses them. Settings already edits the same fields.

- [ ] **Step 1: Add the import**

In `dentai-app/app/doctor/setup/page.jsx`, after the existing `import { createClinic } ...` lines, add:

```js
import { updateClinic } from '@/lib/services/clinic.service';
```

- [ ] **Step 2: Persist hours in `handleDone`**

In `handleDone`, replace:

```js
      // derive open/close from first session for schedule grid
      const firstSession = (c.sessions || [])[0] || { open: '09:00', close: '18:00' };
      saveClinic({ ...c, open: firstSession.open, close: firstSession.close });
```

with:

```js
      // derive open/close from first session for schedule grid
      const firstSession = (c.sessions || [])[0] || { open: '09:00', close: '18:00' };
      // Persist hours so the scheduler uses them. Normalize Sunday (0 -> 7) to match
      // the Settings encoding the backend already stores. Non-fatal: defaults apply
      // and the doctor can edit later in Settings.
      const workingDays = [...new Set((c.days || []).map((d) => (d === 0 ? 7 : d)))].sort((a, b) => a - b);
      try {
        await updateClinic({ openTime: firstSession.open, closeTime: firstSession.close, workingDays });
      } catch { /* non-fatal — defaults apply, editable in Settings */ }
      saveClinic({ ...c, open: firstSession.open, close: firstSession.close });
```

- [ ] **Step 3: Lint the file**

Run: `cd dentai-app && npx eslint app/doctor/setup/page.jsx`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the app (`/run` or the project's dev command), complete doctor setup with custom hours (e.g. open 08:00, close 20:00, deselect a day), and confirm:
- The network tab shows `PATCH /api/clinic` with `{ openTime, closeTime, workingDays }`.
- Settings → Working hours reflects the same values after reload.

- [ ] **Step 5: Commit**

```bash
git add dentai-app/app/doctor/setup/page.jsx
git commit -m "feat(web): persist onboarding working hours to the clinic"
```

---

### Task 8: End-to-end integration verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npx jest`
Expected: all suites PASS.

- [ ] **Step 2: Manual queue-consult smoke**

With the app running and a clinic whose working days exclude, say, Sunday:
- Start a queue consult, dictate a multi-sitting treatment with a price and a "come back next week" (e.g. "RCT on 36, three sittings, four thousand five hundred rupees, review next week").
- On the verification card, confirm **Diagnosis, Sittings (3), Est. cost (4500)** are pre-filled.
- Confirm. Verify in the schedule that the suggested appointments:
  - land on **working days only** (none on a closed day),
  - sit **within the clinic open→close window**,
  - have status `suggested`.

- [ ] **Step 3: Manual profile-consult smoke**

- From a patient profile, start a consultation, dictate the same.
- Confirm & save. Verify exactly **one** visit is created (no duplicate), a treatment plan exists with the right sittings/cost, and suggested appointments appear — i.e. the profile path now matches the queue path.

- [ ] **Step 4: Cost-fallback smoke**

- Dictate a treatment that matches a catalog procedure but **state no price**.
- Confirm the Est. cost is pre-filled from the catalog (fee × sittings), not 0.

- [ ] **Step 5: Settings-change auto-refresh smoke**

- Change working hours in Settings (e.g. close at 14:00).
- Run a new consult confirm; verify the new suggested slots respect the updated window (proves fresh read, no caching).

- [ ] **Step 6: Final commit (if any verification fix was needed)**

```bash
git add -A && git commit -m "test: end-to-end verification fixes for consult auto-extract + scheduling"
```

---

## Self-Review

**Spec coverage:**
- §1 extraction fields → Task 1 ✓
- §2 cost fallback → Task 2 ✓
- §3 frontend mapping → Task 4 ✓
- §4 scheduling uses clinic hours + skip closed days → Task 3 ✓
- §5 unify profile path (no double visit) → Task 5 (backend) + Task 6 (frontend, removes the duplicate `createVisit` for the voice path) ✓
- §6 onboarding capture → Task 7 ✓
- §7 API + store (no new endpoint; verify columns) → Task 3 Step 7 (column check) + Task 7 (uses existing PATCH) ✓
- Testing section of spec → Tasks 1–3 unit tests + Task 8 integration ✓
- Risks: schema drift → Task 3 Step 7; learning-loop noise → Task 2 (value on `extracted`) + Task 4 Step 4; double visit → Task 6 branch; prompt drift/salvage → Task 1 Step 6 ✓

**Placeholder scan:** none — every code step shows full code; every run step shows the command + expected result.

**Type consistency:** `applyCostFallback(extracted, procedureCatalog)`, `isWorkingDay(date, workingDays)`, `nextWorkingDay(date, workingDays)`, `pickSlot(bookedRanges, openMin, closeMin, durationMins, alreadyPickedMins)`, `loadClinicHours(clinicId) -> {openMin, closeMin, workingDays}`, `firstFreeTime(clinicId, date, durationMins, alreadyPicked, hours)` — names/signatures used consistently across Tasks 2, 3, and the transaction wiring. Frontend `ex.diagnosis/totalSittings/estimatedCost` ↔ `confirmed_data.diagnosis/total_sittings/estimated_cost` match the backend `confirmedDataSchema` and `confirmConsultationDraft` reads.
