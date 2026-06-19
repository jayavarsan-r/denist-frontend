# DentAI — Phase 2 Deep Performance Investigation

**Date:** 2026-06-18
**Scope:** User-facing flow tracing (registration, profile, cases). Phase-1 quick
wins (compression, index cleanup, queue polling, logging) are **not** re-audited.
**Method:** Live latency probes against the deployed backend + live-DB query timing +
code tracing on the intended-deploy state (`fix/pilot-issues-batch` branch).

---

## Executive Summary

**Two measured facts dominate everything below:**

### Fact 1 — The deployed backend cold-starts in ~21.6 seconds.
A direct probe of the production `/health` endpoint (which does **zero** DB work):

```
request 1 (cold): total=21.63s  ttfb=21.63s
request 2 (warm): total=0.58s   ttfb=0.58s
request 3 (warm): total=0.95s   ttfb=0.95s
5 more warm:      0.37–0.90s
```

`render.yaml` has **no plan / health-check / keep-warm config** → the service runs on
a spin-down tier and sleeps when idle. **This single fact explains complaint #1
("registration takes 10–15s")** — it is not the registration code; it is the first
request after idle paying a cold boot. It also explains the intermittent
"sometimes doesn't load" (#2) and "feels slow during daily usage" (#9): the *first*
action in any session, or after a lull, is slow; everything after is sub-second.

**The app is genuinely fast when warm (0.4–0.9s).** The #1 performance fix is
operational, not code: **keep the instance warm** (paid tier with no spin-down, or a
cron pinger) and **set `NODE_ENV=production`**.

### Fact 2 — The Phase-1 fixes and Phase-1 quick wins are BOTH unmerged.
```
main (= deployed):        the fixes are NOT here
fix/pilot-issues-batch:   10 commits ahead of main  (registration, cases, voice, findings…)
perf/quick-wins:          3 commits ahead of main   (compression, indexes, polling)
```
**Complaints #1, #3, #4, #5, #6, #7, #8 map directly to issues already fixed on
`fix/pilot-issues-batch`** — but users are running `main`, which has none of them. So a
large fraction of the "remaining" bottlenecks are **already-fixed-but-not-deployed**.
The highest-leverage action this week is to **merge and deploy both branches**, then
re-measure.

> Note: the deployed responses already carry `content-encoding: gzip` from the
> **Cloudflare edge** (`cf-ray` present). So the Phase-1 app-level `compression`
> middleware is **largely redundant for client traffic** — it only helps the
> origin→edge hop. Honest correction to the Phase-1 estimate; keep it (cheap) but
> don't expect a big client-side win from it.

**Remaining genuine code bottlenecks (present even with both branches deployed):**
1. Patient profile fires ~7 API calls on open, including the **case-sheet endpoint
   twice** and **redundant** prescription/lab refetches of data the case-sheet already
   returns.
2. Unbounded list loads (`loadPatients`, analytics counts in JS, `visits.list`).
3. No list virtualization (breaks at 10k+ rows).

**Overall scaling score (current architecture): 5/10** — fine to ~100 concurrent users
when warm; cold-start + unbounded reads + single dev instance cap it.

---

## Top 10 Remaining Bottlenecks

| # | Bottleneck | Root cause | Impact | Fix tier |
|---|-----------|-----------|--------|----------|
| 1 | **21.6s cold start** | No keep-warm; spin-down tier; `NODE_ENV=development` | **Critical** — IS complaint #1 | Ops, <1hr |
| 2 | **Fixes not deployed** | `fix/*` + `perf/*` branches unmerged | **Critical** — complaints 1,3-8 | Deploy, <1day |
| 3 | **Profile fetches case-sheet ×2** | `CaseSheetTab` refetches what `PatientProfile` already has | High (~+1.07s) | <1day |
| 4 | **Profile redundant rx/lab fetch** | separate `loadPatientPrescriptions`/`loadPatientLabOrders`/`listLabCases` duplicate case-sheet data | High (~+0.5s + extra round-trips) | <1day |
| 5 | **~7 uncoordinated profile calls** | 5 hooks + 2 child fetches, no aggregation | High (serial failures = "doesn't load") | <1day |
| 6 | **Unbounded `loadPatients` on bootstrap** | full table + nested joins, every app open | Med now, High at 10k | <1day |
| 7 | **Analytics counts/sums in JS** | `select('status')`/`select('id')` then `.length` | Med now, High at scale | <1week |
| 8 | **No list virtualization** | patients/schedule/history render all rows | None now, High at 10k | <1week |
| 9 | **Unbounded `visits.list` / `lab-orders.list`** | `findAll` no limit | Med at scale | <1week |
| 10 | **In-memory rate limiter + single instance** | per-instance state; no horizontal plan | Med at 100+ users | <1month |

---

## Flow 1: Patient Registration — Waterfall

**Measured end-to-end (deployed, COLD):** ~21.6s. **(WARM):** ~0.7–1.2s.

| Stage | Warm time | % | Notes |
|-------|----------|---|-------|
| Frontend click + validation | <5ms | ~0 | `NewPatientSheet.create` — sync field checks |
| Network → Render (TLS+edge) | ~80–160ms | ~15% | Cloudflare→Render origin |
| **Cold-boot (if asleep)** | **~21,000ms** | **~99% when cold** | **THE bottleneck** |
| Auth middleware | ~1–200ms | small | new tokens: 0 DB hits; legacy tokens: 1 `staff` lookup |
| DB: clinic + count (parallel) | ~345–940ms (1 round-trip) | ~40% warm | `Promise.all` — already optimized (Phase 1) |
| DB: insert (+rare retry) | ~200ms | ~25% warm | single insert; UHID via unique-index retry |
| Realtime broadcast | 0 | 0 | **none** — create path doesn't broadcast |
| Audit logging | 0 | 0 | **none** in patients.create |
| Response serialization | <5ms | ~0 | small JSON |

**Exact bottleneck:** cold start (when cold) → otherwise the 2 DB round-trips (~0.6–1.1s
warm, already minimized in Phase 1). The registration code is **not** the problem.
*Files:* `backend/src/controllers/patients.controller.js:38` (post-fix, parallel),
`render.yaml` (no keep-warm).

**Fix:** keep-warm + `NODE_ENV=production`. Code is already optimal.

---

## Flow 2: Open Patient Profile — Waterfall & Queries

`app/patients/[id]/PatientProfileClient.jsx` fires **~7 separate API calls** on open:

| # | Call | File:line | Returns | Redundant? |
|---|------|-----------|---------|-----------|
| 1 | `fetchPatient(id)` | `:1023` | patient detail (`*, visits(*), appointments(*)`) | — |
| 2 | `getToothHistory(id)` | `:1035` | tooth map + general visits | partial (overlaps visits) |
| 3 | `loadPatientLabOrders(id)` | `:1052` | lab orders | **YES** — case-sheet returns `labOrders` |
| 4 | `loadPatientPrescriptions(id)` | `:1053` | prescriptions | **YES** — case-sheet returns `prescriptions` |
| 5 | `getPatientCaseSheet(id)` | `:1061` (parent) | 7-query aggregate | — |
| 6 | `getPatientCaseSheet(p.id)` | `:859` (**CaseSheetTab**) | **same 7-query aggregate AGAIN** | **YES — duplicate** |
| 7 | `listLabCases({patient_id})` | `:510` (LabTab) | lab cases | partial |

**Measured (live DB, warm):**
- `buildCaseSheet` (7 parallel queries) = **1,074ms** — runs **twice** = ~2.1s.
- Redundant prescriptions + lab refetch = **+426ms**.

**N+1 / duplicate / overfetch findings:**
- **Duplicate query:** `getPatientCaseSheet` called in both `PatientProfile` (parent,
  `:1058-1061`) and `CaseSheetTab` (child, `:853-861`) — two independent `caseSheet`
  states. The heavyweight aggregate runs twice.
- **Overfetch:** `buildCaseSheet` (`patients.routes.js:277`) uses
  `visits.select('*, visit_notes(*)')` and `prescriptions.select('*')` — pulls jsonb
  blobs (`structured_note`, `gemini_raw`, `medicines`, `raw_transcript`) the list views
  don't render.
- **Redundant fetches:** `loadPatientPrescriptions` + `loadPatientLabOrders` (store) and
  `listLabCases` re-fetch data the case-sheet already contains.
- **No true backend N+1** (aggregate uses `Promise.all`, not per-row loops) — good.

**Why "history sometimes doesn't load" (#2):** 7 uncoordinated calls, each with its own
`.catch(() => {})`. If any fails (cold-start timeout, rate-limit, dropped socket), that
slice of the UI silently shows empty while others populate — looks like "history didn't
load." Fewer, coordinated calls = fewer partial failures.

**Fix (high impact, <1 day):**
```jsx
// PatientProfile (parent) fetches the case sheet ONCE and passes it down.
// CaseSheetTab takes caseSheet as a prop instead of refetching:
function CaseSheetTab({ p, caseSheet, visits, procedures, openSheet }) { /* no own fetch */ }

// Drop the redundant store loads — read prescriptions/labOrders from caseSheet:
//   prescriptions  ← caseSheet.prescriptions
//   labOrders      ← caseSheet.labOrders
// Keep getToothHistory (distinct shape) but consider folding its data into the
// case-sheet endpoint later.
```
Expected: ~7 calls → ~2–3, case-sheet 2× → 1×. **~2.5s → ~1.1s warm** on profile open,
and far fewer partial-load failures.

---

## Flow 3: Cases Page — Render Analysis

`CasesTab` (`PatientProfileClient.jsx:304`) is **render-bound, not fetch-bound** — it
reads the parent's already-loaded `caseSheet` prop (no own API call). So once Flow 2's
case-sheet resolves, Cases renders from memory.

- **API time:** 0 additional (uses parent `caseSheet`). ✅
- **DB time:** 0 additional.
- **Render:** sorts + maps `history`, `plans`, and (post-fix) computes
  `rxForVisit(v)`/`planDiagnosis` per visit row. At < 100 visits this is instant; at
  10k visits the unsorted/unvirtualized `.map` over all rows would jank.
- **Re-renders:** `caseSheet` is fetched in two places (Flow 2 #6) → the duplicate
  fetch causes an extra state update + re-render of the tab subtree.

**Note on complaint #3 (cases not showing diagnosis/prescription):** this was a
*correctness* bug, already **fixed** on `fix/pilot-issues-batch` (diagnosis +
structured Rx now render per case). It is a deploy gap, not a perf issue.

**Fix:** dedupe the case-sheet fetch (Flow 2 fix) removes the redundant re-render;
add virtualization to the history list before 10k-row clinics.

---

## Database Bottlenecks (codebase scan)

| Issue | File:function | Current behavior | Risk | Fix |
|-------|--------------|------------------|------|-----|
| JS aggregation | `analytics.routes.js:15-33` dashboard | `select('status')`/`select('id')` → `.length`/`.filter().length` in Node | **High at scale** (full scan + transfer to count) | SQL `GROUP BY` / `count` head, or a `clinic_dashboard_stats(clinic_id)` RPC (pattern already used for `lab_turnaround_stats`) |
| In-app low-stock filter | `inventory.routes.js:31,44` | fetch ALL inventory, `.filter(stock_qty <= threshold)` in JS | Med (941 rows now) | generated column `is_low_stock` or RPC; PostgREST can't compare two columns |
| Unbounded list | `visits.controller.js:11 list` | `findAll` no limit/pagination | Med at scale | default bounded page; cursor pagination |
| Unbounded list + join | `lab-orders.routes.js:35` | `findAll('*, patients(name)')` no limit | Med | bound + select columns |
| Overfetch `select('*')` | `buildCaseSheet` + 60 other sites | pulls jsonb/transcript blobs into lists | Med | explicit columns on list reads |
| Unbounded patient list | `patients.controller.js:13 list` | full table + nested joins unless `?page` passed | Med now, High at 10k | make bounded page the **default** |

*Good (verified):* indexing is thorough (Phase 1), aggregates use `Promise.all`, uploads
stream, no per-row N+1 loops.

---

## Frontend Bottlenecks

| Issue | File:line | Behavior | At 1k / 10k / 50k / 100k |
|-------|-----------|----------|--------------------------|
| Unbounded bootstrap loads | `useBootstrap.js:26-28` | `loadPatients()` (all + joins) + `loadQueue()` + `loadTodayAppointments()` on every app open | ok / slow / broken / broken |
| Duplicate case-sheet fetch | `PatientProfileClient.jsx:859` & `:1061` | heavyweight aggregate fetched 2× | adds ~1s every profile open |
| Redundant rx/lab loads | `PatientProfileClient.jsx:1052-1053`, `:510` | refetch case-sheet data | extra round-trips, partial-load failures |
| No virtualization | patients list, schedule, visit history | render every row | ok / janky / broken / broken |
| Large component | `PatientProfileClient.jsx` (1,210 lines, 9 useEffects, ~7 tabs eager) | one client chunk, all tabs mounted | bundle + render cost |

*Good (verified):* `useBootstrap` is correctly guarded (`didLoad` ref → fires once, no
loop); state is zustand with **no React Context providers** (no giant-context
re-render problem); the queue poll is fixed (Phase 1).

**No render loops or runaway useEffect chains found** — the 9 effects in
PatientProfileClient each key on `patientId`/`patientDataVersion` and don't self-trigger.

---

## Scalability (20 / 100 / 500 concurrent clinics)

**Connection model:** `supabase-js` → PostgREST over HTTP. No app-side pool; pooling is
Supabase's PgBouncer. Scaling lever = **fewer round-trips + caching + warm instances**,
not a Node pool.

| Clinics | Risk | Detail |
|---------|------|--------|
| 20 | Low (warm) | Cold-start still bites the first user each idle period |
| 100 | **Medium** | Profile's 7-calls × concurrency multiplies round-trips; in-memory rate limiter is per-instance; single instance = CPU/event-loop ceiling |
| 500 | **High** | PostgREST/PgBouncer connection pressure; realtime fan-out (every queue client subscribes to `queue:{clinicId}` — fine, clinic-scoped — but the global Supabase realtime connection cap applies); single dev instance saturates; no read replica/cache |

- **Connection exhaustion:** at 500 clinics, concurrent heavy reads (case-sheet ×2,
  analytics full-scans) pressure PgBouncer. Cutting redundant queries (Flow 2 fix) and
  moving analytics to RPC reduces connection-seconds the most.
- **Realtime scaling:** subscriptions are clinic-scoped (`filter: clinic_id=eq`) — good
  isolation — but Supabase's per-project realtime limits apply globally; at 500 active
  clinics monitor the realtime connection/message budget.
- **Memory:** no growing module-level collections found; the risk is **per-request**
  memory from unbounded list fetches (e.g. `loadPatients` of a 100k-row clinic), not a
  leak.

**Scaling score: 5/10** today (good data model/indexes; capped by cold-start, unbounded
reads, single dev instance, no cache). → **7-8/10** achievable with: warm prod instance,
the Flow-2 dedup, analytics RPC, a cache layer, and horizontal scaling with a shared
rate-limit store.

---

## Prioritized Fixes

### High impact (< 1 day)
1. **Keep the instance warm + `NODE_ENV=production`** (`render.yaml`). Eliminates the
   21.6s cold start — the biggest single user-facing win. *Latency: 21s → <1s first action.*
2. **Merge & deploy `fix/pilot-issues-batch` + `perf/quick-wins`.** Resolves complaints
   1,3,4,5,6,7,8 (already fixed, not shipped).
3. **Dedupe the profile case-sheet fetch** — `CaseSheetTab` takes `caseSheet` as a prop;
   drop redundant `loadPatientPrescriptions`/`loadPatientLabOrders`/`listLabCases`
   (read from case-sheet). *Latency: profile open ~2.5s → ~1.1s warm; fewer partial-load
   failures (complaint #2).*

### Medium (< 1 week)
4. **Bound `loadPatients()`** to a first page; drop nested joins from the list select.
   *(useBootstrap.js, patients.controller LIST_SELECT)*
5. **Analytics → SQL/RPC** (`clinic_dashboard_stats`). Stops full-table scans-to-count.
6. **List virtualization** for patients + schedule + long visit history.
7. **Trim `select('*')`** on list endpoints; explicit columns (drop jsonb blobs).
8. **Bound `visits.list` / `lab-orders.list`** with default pagination.

### Architecture (< 1 month)
9. **Cache layer (Redis)** for hot reads (clinic, staff, inventory catalog, dashboard
   stats) + **shared rate-limit store** for multi-instance.
10. **Aggregate the profile into one endpoint** — extend `case-sheet` to include
    tooth-history + lab-cases so the profile is a single round-trip.
11. **Sentry + OpenTelemetry** — you are currently blind to real prod latency/cold-starts;
    instrument before scaling past 100 clinics.
12. **Horizontal scaling plan** (multi-instance + Supabase pooling/replica) before 500
    clinics.

---

## Expected Latency Improvements (summary)
| Fix | Before | After |
|-----|--------|-------|
| Keep-warm | 10–22s first action | <1s |
| Profile case-sheet dedupe | ~2.5s open (warm) | ~1.1s |
| Analytics RPC | scan-to-count (grows) | O(index) constant |
| Bounded loadPatients | full table on open | first page only |

## Honesty / caveats
- Cold-start (21.6s) and warm (0.4–0.9s) numbers are **real probes** of production.
- Case-sheet timing (1.07s ×2) is measured on the live DB **from a fast dev connection**
  — real mobile/edge latency is higher.
- "At scale" rows are extrapolations from today's tiny dataset (< 100 clinical rows);
  confirm with `EXPLAIN ANALYZE` + load testing as data grows.
- The Phase-1 `compression` win is **mostly redundant** (Cloudflare edge already gzips);
  reported here as a correction.
- This investigation changed **no code** — analysis only.
