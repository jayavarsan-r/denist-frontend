# DentAI — Production Performance Audit

**Date:** 2026-06-18
**Auditor scope:** Backend (Express/Supabase), Frontend (Next.js 16), live Supabase DB.
**Method:** Static code audit cross-checked against the **live database** (row counts, indexes, query plans) — not generic advice.

---

## Executive Summary

**The headline finding overturns the premise of "the database is slow."** The live
database is tiny (largest table `inventory_items` = 941 rows; everything clinical is
< 100 rows) and **indexing is genuinely thorough** — every hot column (`clinic_id`,
`patient_id`, `dentist_id`, soft-delete partials, trigram indexes on patient
name/phone and inventory name) is already indexed. There are **no missing indexes on
current access paths and no query-plan problems at current scale.**

Therefore the perceived slowness — pages taking time, requests delayed — is **not
query-bound. It is architectural and infrastructural:**

1. **Cold-start / dev-mode deployment.** The Render service runs `NODE_ENV=development`
   on an instance that spins down when idle. The first request after a lull pays
   multi-second wake-up latency. This is the single biggest contributor to "the app is
   slow" and to the #15/#16 "could not save" the prior session fixed.
2. **Chatty round-trips.** `supabase-js` talks to PostgREST over HTTP — every query is
   a separate network round-trip. Latency scales with *round-trip count*, not row
   count. Several flows do avoidable sequential round-trips.
3. **No response compression.** No `compression` middleware; every JSON payload ships
   uncompressed.
4. **Unbounded list fetches + 5s polling on the frontend.** `loadPatients()` fetches
   the entire patients table (with joins) on every app open; the queue screen refetches
   the full queue every 5 seconds *in addition to* a working realtime subscription.
5. **In-application aggregation.** Analytics loads rows and counts/sums them in JS
   instead of in SQL — fine at 74 visits, a full-table scan at 100k.

**At today's scale (≈50 clinics, < 100 rows/table) the app is fast when warm.** The
risks below are about **what breaks as data and concurrency grow**, plus a handful of
**quick wins that help even now** (compression, killing the redundant poll, dropping
duplicate indexes).

**Overall production-readiness: 6.5/10** — solid data model and indexing, but
infra/architecture choices cap it. Scores per category at the end.

---

## Top 20 Performance Problems (ranked by impact × likelihood)

| # | Problem | File | Impact now | Impact at scale |
|---|---------|------|-----------|-----------------|
| 1 | Deploy runs `NODE_ENV=development` on a cold-start instance | `render.yaml` | **High** | High |
| 2 | No response compression | `backend/src/server.js` | Medium | High |
| 3 | Queue: 5s full-refetch poll runs alongside realtime | `lib/hooks/useQueueRealtime.js:22` | Medium | **High** (N clients × 12/min) |
| 4 | `loadPatients()` fetches ALL patients + joins, no pagination | `usePatientStore.loadPatients` → `patients.controller.list` | Low now | **High** at 10k+ |
| 5 | Analytics aggregates in JS (loads rows to count/sum) | `backend/src/routes/analytics.routes.js:15-23` | Low now | **High** |
| 6 | Duplicate indexes (write amplification, bloat) | live DB: patients, queue_entries, visits, prescriptions, treatment_plans | Low | Medium |
| 7 | `LIST_SELECT` overfetch (nested visits+appointments on every patient row) | `patients.controller.js:6` | Low now | High |
| 8 | `lab-cases` page polls every 5s | `app/finance/lab-cases/page.jsx:59` | Low | Medium |
| 9 | Per-request `staff` lookup for legacy tokens | `backend/src/middleware/auth.js:21` | Low | Medium |
| 10 | `select('*')` in 61 call sites (overfetch incl. jsonb/transcript blobs) | controllers/routes | Low | Medium |
| 11 | OFFSET pagination (`.range(from,to)`) where paging exists | `utils/pagination.js`, list endpoints | None now | Medium at deep pages |
| 12 | `exact` COUNT on 10 query sites | repos/controllers | Low | Medium |
| 13 | `PatientProfileClient.jsx` = 1,210 lines, all tabs eager | `app/patients/[id]/PatientProfileClient.jsx` | Low | Medium (bundle/render) |
| 14 | No list virtualization (patients, schedule, history) | frontend lists | None now | **High** at 10k rows |
| 15 | `morgan('dev')` logging in production | `backend/src/server.js:23` | Low | Low |
| 16 | `ilike '%q%'` patient search (leading wildcard) | `patients.controller.js:22` | None (trigram idx exists) | Medium |
| 17 | No HTTP caching headers / ETag on read endpoints | all GET routes | Low | Medium |
| 18 | No APM / slow-query tracking / error monitoring | whole stack | — | High (blind at scale) |
| 19 | Case-sheet ships full nested payload uncompressed | `patients.routes.js:263` | Low | Medium |
| 20 | Rate limiter is in-memory (per-instance) | `backend/src/server.js:35` | None | Medium (multi-instance) |

---

## 1. Database Performance

### What's actually GOOD (verified against live DB)
- **Indexing is thorough.** Every `clinic_id`, `patient_id`, `dentist_id`, soft-delete
  (`deleted_at`/`is_deleted` partial), and search column is indexed. Trigram indexes
  exist for fuzzy search: `idx_patients_name_trgm`, `idx_patients_phone_trgm`,
  `idx_inventory_name_trgm`. The `patients_clinic_uhid_uniq` partial unique index backs
  the UHID race-fix.
- **No N+1 in the backend.** The aggregate reads (`buildCaseSheet`, analytics) use a
  single `Promise.all` of independent queries with PostgREST nested selects — not a
  loop of per-row queries.
- **Uploads stream** (`storage.service.js` uses `createReadStream`, not a buffer).

### Real issues

**1.1 Duplicate indexes** (write amplification + storage bloat). Live DB has redundant
indexes covering identical columns:
- `patients`: `idx_patients_clinic_id` ≈ `patients_clinic_idx`; `idx_patients_dentist_id` ≈ `patients_dentist_idx`; `idx_patients_is_deleted` ≈ `idx_patients_active`
- `queue_entries`: **three** clinic+date indexes — `idx_queue_clinic_date`, `idx_queue_entries_clinic_date`, `queue_entries_clinic_date_idx`; plus `idx_queue_status` ≈ `idx_queue_entries_status`
- `visits`: `idx_visits_patient_id` ≈ `visits_patient_idx`; `idx_visits_dentist_id` ≈ `visits_dentist_idx`
- `prescriptions`: `idx_prescriptions_patient` ≈ `prescriptions_patient_idx`
- `treatment_plans`: `idx_treatment_plans_patient` ≈ `treatment_plans_patient_idx`

*Why it's slow:* each duplicate must be maintained on every INSERT/UPDATE/DELETE — pure
write overhead with zero read benefit. *Impact:* low now, compounds with write volume.
*Fix:* drop the redundant copies (keep one per column set). Verify usage first:
```sql
-- find unused indexes (idx_scan = 0) before dropping
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes WHERE schemaname='public' AND idx_scan = 0
ORDER BY relname;
-- then, e.g.:
DROP INDEX IF EXISTS queue_entries_clinic_date_idx;   -- keep idx_queue_entries_clinic_date
DROP INDEX IF EXISTS idx_queue_clinic_date;
DROP INDEX IF EXISTS patients_clinic_idx;             -- keep idx_patients_clinic_id
DROP INDEX IF EXISTS patients_dentist_idx;
DROP INDEX IF EXISTS visits_patient_idx;
DROP INDEX IF EXISTS visits_dentist_idx;
DROP INDEX IF EXISTS prescriptions_patient_idx;
DROP INDEX IF EXISTS treatment_plans_patient_idx;
```

**1.2 In-application aggregation** — `analytics.routes.js:15-23`:
```js
scoped(supabase.from('appointments').select('status'), req)   // loads ALL rows to count by status
scoped(supabase.from('visits').select('id'), req)             // loads ALL ids to take .length
```
*Why it's slow:* transfers every row to Node to compute a count/group. At 100k visits
this is a full-table scan + 100k-row transfer per dashboard load. *Fix:* push to SQL:
```sql
-- a Postgres function or PostgREST head+count:
SELECT status, count(*) FROM appointments WHERE clinic_id = $1 GROUP BY status;
SELECT count(*) FROM visits WHERE clinic_id = $1;  -- via .select('id',{count:'exact',head:true})
```
The dashboard already uses an RPC (`lab_turnaround_stats`) for one metric — extend that
pattern (a `clinic_dashboard_stats(clinic_id)` function returning all counters in one call).

**1.3 OFFSET pagination** — `utils/pagination.js` builds `.range(from, to)` (LIMIT/OFFSET).
Fine for shallow pages; at deep offsets (`OFFSET 50000`) Postgres still scans+discards
the skipped rows. *Fix (when lists grow):* cursor/keyset pagination on the ordered
column, e.g. `WHERE created_at < $cursor ORDER BY created_at DESC LIMIT 20`.

**1.4 `select('*')` (61 sites)** pulls heavy columns clients don't render — notably
`raw_transcript`, `gemini_raw` (jsonb), `structured_note` (jsonb), `medicines` (jsonb).
*Fix:* explicit column lists on list endpoints; keep `*` only on single-row detail reads.

---

## 2. API Performance

### Per-endpoint notes
- **`GET /api/patients/:id/case-sheet`** (`patients.routes.js:263`): 7 parallel queries
  via `Promise.all` (good — not sequential), but returns a large nested payload
  (patient + all plans + all visits *with visit_notes* + all prescriptions + xrays +
  appts + lab orders) **uncompressed**. *Estimate warm:* ~150–400ms today; payload
  grows linearly with patient history. *Fix:* compression (below) + column trimming +
  cap visits/prescriptions to recent N with a "load more".
- **`POST /api/patients`** (registration): fixed in the prior session (was 4–8
  sequential round-trips; now ~2). ✅
- **`GET /api/patients`** (list): no default pagination — see 4.1.

### 2.1 No response compression (quick win, helps NOW)
`server.js` has no `compression` middleware. JSON gzips 5–10×.
```js
// backend/src/server.js — after helmet()
const compression = require('compression');   // add to package.json deps
app.use(compression());
```

### 2.2 `morgan('dev')` in production
`server.js:23` uses dev logging on a `NODE_ENV=development` box. *Fix:* `morgan('combined')`
(or a structured logger) gated on env; pairs with fixing #1.

### 2.3 No HTTP caching / ETag
Read endpoints set no `Cache-Control`/`ETag`. Even short-TTL caching on
clinic/staff/inventory-catalog reads would cut repeat load. *Fix:* `ETag` via a
middleware, or `Cache-Control: private, max-age=30` on slow-changing GETs.

---

## 3. Frontend Performance

### 3.1 Queue: redundant 5s poll defeats realtime (highest-value FE fix)
`lib/hooks/useQueueRealtime.js:22` runs `setInterval(() => loadQueue(), 5000)`
**unconditionally**, while *also* holding a Supabase Realtime subscription that already
does incremental `mergeEntry`. Result: every open client refetches the **entire queue
12×/minute** even when realtime is healthy.
*Impact at scale:* 100 concurrent clients = ~20 full-queue reads/sec of pure waste,
all hitting the cold/dev backend. *Fix:* only poll as a fallback when realtime is
**not** connected, and back off (e.g. 20–30s):
```js
// start the interval ONLY if the subscription failed/closed; clear it once realtime
// connects. Or raise to 30s. The realtime path already keeps the queue fresh.
```

### 3.2 `loadPatients()` fetches the whole table on app open
`useBootstrap.js:26` → `loadPatients()` (no args) → `patients.controller.list` returns
**all** patients with the `LIST_SELECT` nested join (`visits(...), appointments(...)`).
- 1k records: noticeable payload (joins multiply rows).
- 10k / 50k / 100k: multi-MB JSON, slow parse, janky list. **Will not scale.**
*Fix:* paginate the bootstrap load (first page only), lazy-load the rest on scroll;
drop the nested joins from the list select (fetch them on the profile screen).

### 3.3 No list virtualization
Patients, schedule, and treatment-history lists render every row. At 10k rows the DOM
node count alone stalls scroll. *Fix:* `react-window`/`@tanstack/react-virtual` for the
patients and schedule lists.

### 3.4 `PatientProfileClient.jsx` — 1,210-line client component
All ~6 tabs (Overview, Cases, Tooth Map, Billing, Lab, case sheet) are defined and
mounted in one client bundle chunk. *Fix:* code-split per tab (dynamic import the
inactive tabs); it shrinks the route's JS and initial render cost.

### 3.5 Scale-by-page-size table
| Page | 1k | 10k | 50k | 100k |
|------|----|-----|-----|------|
| `/patients` (full fetch + joins, no virtualization) | slow payload | **broken** | broken | broken |
| `/schedule` (renders all) | ok | slow | broken | broken |
| Patient profile history (renders all visits) | ok | ok* | slow | slow |
| `/finance` (merges payments+ledger client-side) | ok | slow | slow | broken |
*Assumes a single patient won't have 10k visits; clinic-wide finance can.*

---

## 4. Scaling (10 / 100 / 1k / 10k users)

| Users | Bottleneck | Risk |
|-------|-----------|------|
| 10 | Cold start only | Low — warm = fine |
| 100 | 5s queue poll × clients; in-memory rate limiter per instance | Medium |
| 1,000 | PostgREST round-trip latency; unbounded `loadPatients`; JS analytics; no compression | **High** |
| 10,000 | All of the above + connection saturation at Supabase; single dev instance | **Critical** |

- **Connection model:** `supabase-js` → PostgREST (HTTP). No app-side pool; pooling is
  Supabase's (PgBouncer). The scaling lever is **fewer round-trips + caching**, not a
  Node pool.
- **Rate limiter** (`express-rate-limit`) is in-memory → per-instance; with >1 instance
  the limit is effectively N× and inconsistent. *Fix:* a shared store (Redis) when you
  scale horizontally.
- **No read replica / cache layer.** Add a cache (Redis/HTTP) for hot reads
  (clinic, staff, inventory catalog, dashboard stats) before 1k users.

**DB scaling risk score: 4/10 today (tiny data, good indexes) → 8/10 at 10k users on
the current architecture** (dev instance, no compression/cache, chatty reads).

---

## 5. Backend Architecture
- **Good:** async voice/WhatsApp/reminders are already off-request via **pg-boss
  workers** (`workers/`), not inline. Aggregates use `Promise.all`. Graceful shutdown
  exists.
- **Improve:** move analytics counters to SQL/RPC (5.x above). Consider an in-memory or
  Redis cache for the clinic/staff/catalog reads that every screen pulls.
- **No memory-leak smells found** (no growing module-level collections; cursors/intervals
  are cleaned up in hooks).

## 6. Search & Filtering
- Patient search uses `name.ilike.%q%,phone.ilike.%q%` (`patients.controller.js:22`).
  Leading-wildcard `ilike` can't use a btree index — **but** `idx_patients_name_trgm` /
  `idx_patients_phone_trgm` (gin_trgm) make it index-assisted. Verify the planner uses
  them at scale (`EXPLAIN`); if not, switch to explicit `%` trigram operators or
  full-text. No external search engine needed at this data size.

## 7. Pagination
- Opt-in only (`?page`/`?limit`); the default list path returns everything. Make the
  **default** a bounded first page; offer cursor pagination for big lists (1.3, 3.2).

## 8. Auth & Security Performance
- New tokens carry `staffId/clinicId` inline → **no DB hit** in `auth.js`. Only
  **legacy** tokens trigger a per-request `staff` lookup (`auth.js:21`). *Fix:* let those
  tokens re-mint on next login (already the design); optionally cache staff rows by
  `dentist_id` for a few minutes to bound the legacy path. JWT verify is CPU-cheap.

## 9. File Upload & Media
- **Streaming upload is correct** (`storage.service.js` `createReadStream`). ✅
- Audio is processed off-request in `voice.worker`. ✅
- *Improve:* serve media via signed CDN URLs (Supabase Storage already supports a CDN);
  ensure images/x-rays are resized/compressed before transfer. No blocking uploads found.

## 10. Observability — **biggest gap**
- **Present:** structured request IDs (`requestId` middleware), a logger util, morgan.
- **Missing:** APM, slow-query tracking, error monitoring, metrics, tracing.
- *Plan:* **Sentry** (errors) first — cheapest, highest signal. Then **OpenTelemetry**
  traces → an APM (Datadog/Grafana Tempo) for the request-by-request timeline you want.
  Add Supabase slow-query logging. Without this you are blind to real prod latency.

---

## 11. Production-Readiness Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Performance | 6/10 | Fast warm; cold-start + no compression + chatty FE drag it |
| Scalability | 5/10 | Great indexes, but unbounded fetches + JS aggregation + dev instance |
| Reliability | 6/10 | Workers + graceful shutdown good; single dev instance, no monitoring |
| Security | 7/10 | Strict clinic_id tenancy, helmet, zod, JWT; in-memory rate limit a gap |
| Maintainability | 7/10 | Clean repo/validator/envelope patterns; a few 1k-line components |
| **Overall** | **6.5/10** | Strong foundation; infra/architecture choices are the ceiling |

---

## 12. Prioritized Fixes

### Quick wins (< 1 hour each) — do today
1. **Add `compression` middleware** (`server.js`). 5–10× smaller payloads. *(§2.1)*
2. **Gate the queue 5s poll on realtime being down**, or raise to 30s. *(§3.1)*
3. **Drop duplicate indexes** (after `pg_stat_user_indexes` check). *(§1.1)*
4. **`morgan('dev')` → env-gated combined logger.** *(§2.2)*
5. **Set `NODE_ENV=production`** on Render (the comment in `render.yaml` already says to,
   before real clinics) + keep the instance warm (paid tier / health pinger). *(§1, #1)*

### High-impact (< 1 day)
6. **Bound `loadPatients()`** to a first page; drop nested joins from `LIST_SELECT`;
   lazy-load on scroll. *(§3.2, §4.1)*
7. **Move analytics counters to SQL/RPC** (`clinic_dashboard_stats`). *(§1.2)*
8. **Add Sentry** for error monitoring. *(§10)*
9. **Trim `select('*')`** on list endpoints to explicit columns (drop jsonb/transcript
   blobs from lists). *(§1.4)*

### Medium projects (< 1 week)
10. **List virtualization** for patients + schedule. *(§3.3)*
11. **Cursor pagination** for the big list endpoints. *(§1.3, §7)*
12. **Code-split `PatientProfileClient` tabs.** *(§3.4)*
13. **HTTP/ETag caching** on slow-changing reads (clinic/staff/catalog). *(§2.3)*

### Long-term architecture
14. **Cache layer (Redis)** for hot reads + **shared rate-limit store**. *(§4)*
15. **OpenTelemetry tracing → APM** for request-by-request timelines. *(§10)*
16. **Horizontal scaling plan** (multi-instance + Supabase pooling/replicas) before 1k
    concurrent users. *(§4)*

---

## Estimated Gains (from the quick wins + high-impact tier)
- **Response time (warm):** −30–50% on list/case-sheet endpoints (compression + column
  trimming + bounded fetches).
- **Perceived load time:** the largest single win is eliminating cold starts
  (`NODE_ENV=production` + keep-warm) — turns multi-second first-loads into sub-second.
- **Backend load:** −60–80% of queue traffic by fixing the redundant 5s poll
  (incremental realtime instead of full refetch × every client).
- **DB write throughput:** small but real gain from dropping duplicate indexes.
- **Payload/bandwidth:** −80–90% on JSON responses with gzip — meaningful on mobile.
- **Cost:** fewer round-trips + smaller payloads + a warm right-sized instance → lower
  egress and compute than scaling up to mask the cold-start.

## Caveats / honesty notes
- All "at scale" claims are **extrapolations** from the current tiny dataset; verify with
  `EXPLAIN ANALYZE` and load testing as data grows.
- I did **not** run write-load tests against the shared production DB (out of scope /
  unsafe). Round-trip and payload estimates are from code + schema, not a profiler.
- No code was changed by this audit — it is investigation only.
