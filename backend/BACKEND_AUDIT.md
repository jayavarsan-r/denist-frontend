# BACKEND AUDIT REPORT
**Generated:** 2026-06-04
**Audited by:** Claude Code
**Backend path:** backend/
**Status:** READ-ONLY AUDIT — NO CHANGES MADE

---

## PART 1 — REPOSITORY SNAPSHOT

### 1.1 Actual File Tree

```
backend/
├── package.json
├── .env.example
├── .gitignore
└── src/
    ├── server.js
    ├── config/
    │   └── supabase.js
    ├── middleware/
    │   ├── auth.js
    │   └── errorHandler.js
    ├── routes/
    │   ├── ai.routes.js
    │   ├── analytics.routes.js
    │   ├── appointments.routes.js
    │   ├── auth.routes.js
    │   ├── clinic.routes.js
    │   ├── dataset.routes.js
    │   ├── patients.routes.js
    │   ├── payments.routes.js
    │   ├── prescriptions.routes.js
    │   ├── queue.routes.js
    │   ├── staff.routes.js
    │   ├── treatment-plans.routes.js
    │   ├── visit-notes.routes.js
    │   ├── visits.routes.js
    │   └── xrays.routes.js
    ├── controllers/
    │   ├── ai.controller.js
    │   ├── appointments.controller.js
    │   ├── auth.controller.js
    │   ├── patients.controller.js
    │   └── visits.controller.js
    ├── services/
    │   ├── ai.service.js
    │   ├── pdf.service.js
    │   └── storage.service.js
    └── jobs/
        └── cleanup.job.js
```

**Missing directories:** `src/utils/`, `src/validators/`, `src/helpers/`, `src/config/index.js` — none of these exist; none are referenced.

---

### 1.2 Tech Stack (from package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | HTTP framework |
| @supabase/supabase-js | ^2.39.0 | Database + Storage client |
| jsonwebtoken | ^9.0.2 | JWT signing/verification |
| cors | ^2.8.5 | CORS middleware |
| helmet | ^7.1.0 | Security headers |
| morgan | ^1.10.0 | HTTP request logging |
| express-rate-limit | ^7.2.0 | Rate limiting |
| multer | ^1.4.5-lts.1 | Multipart file upload parsing |
| axios | ^1.6.5 | HTTP client (Sarvam + Gemini calls) |
| form-data | ^4.0.0 | FormData for Sarvam STT requests |
| pdfkit | ^0.18.0 | PDF generation for prescriptions |
| ws | ^8.21.0 | WebSocket transport for Supabase Realtime |
| dotenv | ^16.4.1 | Env file loading |
| nodemon | ^3.0.2 | Dev auto-restart (devDependency) |

**Missing packages that the codebase references but are not in package.json:**
- `@anthropic-ai/sdk` — `.env.example` references `ANTHROPIC_API_KEY` but the codebase never imports this SDK. The AI layer uses Google Gemini via raw `axios` REST calls. This is a misleading env var that is never consumed.

---

### 1.3 Environment Variables

| Variable | Used In | Required | Present in .env.example |
|----------|---------|----------|------------------------|
| PORT | server.js:38 | No (defaults 3000) | Yes |
| NODE_ENV | Not referenced in code | No | Yes |
| SUPABASE_URL | config/supabase.js:8 | Yes | Yes |
| SUPABASE_SERVICE_KEY | config/supabase.js:6 | Yes (or ANON_KEY) | Yes |
| SUPABASE_ANON_KEY | config/supabase.js:6 | Fallback only | Yes |
| JWT_SECRET | middleware/auth.js:8, auth.controller.js:30 | Yes | Yes |
| SARVAM_API_KEY | controllers/ai.controller.js:26,62 | No (has mock fallback) | Yes |
| GEMINI_API_KEY | controllers/ai.controller.js:143,179,217,267,335; services/ai.service.js:4 | No (has mock fallback) | **NO — CRITICAL** |
| DEV_OTP | auth.controller.js:43 | No | Yes |
| DEMO_PHONE | auth.controller.js:41 | No | **NO** |
| DEV_OTP_OTHER | auth.controller.js:44 | No | **NO** |
| ANTHROPIC_API_KEY | *.env.example only* | N/A — never used | Yes (misleading) |
| USE_DEV_OTP | *.env.example only* | N/A — never used in code | Yes (misleading) |

**Variables referenced in code but NOT in .env.example:**
1. `GEMINI_API_KEY` — Used in 6 places across `ai.controller.js` and `ai.service.js`. Without it, all AI endpoints fall back to hardcoded mock data. This is the primary AI key and its absence from `.env.example` means any new developer deploying will have broken AI with no explanation.
2. `DEMO_PHONE` — Used in `auth.controller.js:41` for pinning a specific OTP to a demo phone number. Not documented.
3. `DEV_OTP_OTHER` — Used in `auth.controller.js:44` as fallback OTP for non-demo phones when `DEMO_PHONE` is set. Not documented.

**Variables in .env.example that code never uses:**
1. `ANTHROPIC_API_KEY` — Remnant from an earlier architecture. Not imported anywhere.
2. `USE_DEV_OTP` — Never checked. OTP behavior is controlled by `DEV_OTP` and `DEMO_PHONE` values, not a boolean flag.

---

## PART 2 — SERVER ENTRY POINT ANALYSIS

### 2.1 server.js — What It Does

**Middleware stack (in order):**
1. `helmet()` — sets security headers
2. `cors({ origin: true })` — allows ALL origins
3. `morgan('dev')` — logs HTTP requests to stdout
4. `express.json()` — parses JSON bodies
5. `express.urlencoded({ extended: true })` — parses form bodies
6. `rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })` applied at `/api/` prefix only

**Route registrations (in order):**
```
POST/GET  /api/auth/*              → routes/auth.routes.js
*         /api/patients/*          → routes/patients.routes.js
*         /api/visits/*            → routes/visits.routes.js
*         /api/appointments/*      → routes/appointments.routes.js
*         /api/ai/*                → routes/ai.routes.js
*         /api/analytics/*         → routes/analytics.routes.js
*         /api/treatment-plans/*   → routes/treatment-plans.routes.js
*         /api/visits/:visitId/notes/* → routes/visit-notes.routes.js
*         /api/prescriptions/*     → routes/prescriptions.routes.js
*         /api/xrays/*             → routes/xrays.routes.js
*         /api/dataset/*           → routes/dataset.routes.js
*         /api/queue/*             → routes/queue.routes.js
*         /api/staff/*             → routes/staff.routes.js
*         /api/clinic/*            → routes/clinic.routes.js
*         /api/payments/*          → routes/payments.routes.js
GET       /health                  → inline handler (no auth)
```

**Error handler:** Registered LAST as `require('./middleware/errorHandler')` — correct position.

**Background jobs at boot:**
- 30 seconds after startup: `runAudioCleanup(18)` fires once
- Then every 24 hours: `runAudioCleanup(18)` fires again
- The cleanup function is `require`d inside the `listen` callback (lazy load)

**Database connection check at startup:** None — the server boots successfully even if Supabase is unreachable.

---

### 2.2 Server Configuration Issues

| Issue | Line | Severity | Description |
|-------|------|----------|-------------|
| CORS wildcard in production | 13 | High | `origin: true` allows all origins. Any website can make authenticated requests to this API if a user's token is obtained. Should be restricted to the Capacitor app origin or specific domains in production. |
| Rate limit too permissive for AI | 17 | High | 100 req/15 min global limit applies to all `/api/` routes including AI endpoints. A single Gemini call costs ~$0.001+ and takes 2-5s; 100 calls/15 min per IP could rack up unexpected costs and allow abuse. AI routes have no separate, tighter limit. |
| No startup healthcheck for DB | 39-44 | Medium | Server boots and declares success with no validation that Supabase is reachable. Silent failures until first request hits DB. |
| visit-notes route conflict risk | 26 | Medium | `app.use('/api/visits/:visitId/notes', ...)` registers a parameterized route at the app level. Express will match this BEFORE the `/api/visits/*` router for paths like `/api/visits/123/notes`. This works but is fragile — the `mergeParams: true` in visit-notes router is required. If forgotten in a future edit, `req.params.visitId` silently becomes undefined. |
| No graceful shutdown | — | Low | `SIGTERM` is not handled. In-flight requests are dropped immediately. |

---

## PART 3 — AUTHENTICATION SYSTEM

### 3.1 Auth Flow (Step by Step)

**Step 1 — Send OTP**
- **Endpoint:** `POST /api/auth/send-otp`
- **Controller file:** `controllers/auth.controller.js:34`
- **What it does:**
  1. Validates phone is exactly 10 digits
  2. Checks if phone matches `DEMO_PHONE` env var
  3. If demo phone: uses `DEV_OTP` (default `012345`)
  4. If not demo phone: uses `DEV_OTP_OTHER` OR generates a random 6-digit OTP
  5. Deletes all existing OTPs for this phone
  6. Inserts new OTP row with 10-minute TTL (`expires_at`)
  7. **Does NOT send an SMS** — there is no SMS provider integrated
- **Supabase table used:** `otp_codes`
- **OTP TTL:** 10 minutes
- **SMS sending:** NONE. The OTP exists only in the database. To use OTP auth in production, an SMS provider (Twilio, AWS SNS, MSG91) must be integrated here.
- **Returns:** `{ success: true, message: 'OTP sent' }`
- **Errors handled:** invalid phone format, DB insert error
- **Errors NOT handled:** phone numbers with country code (+91XXXXXXXXXX fails the 10-digit check even though it's valid)

**Step 2 — Verify OTP**
- **Endpoint:** `POST /api/auth/verify-otp`
- **Controller file:** `controllers/auth.controller.js:55`
- **What it does:**
  1. Looks up OTP: phone + code + used=false + not expired
  2. Marks OTP as used
  3. Checks `staff` table for active record with this phone (V3 path)
  4. If staff found: fetches clinic + dentist, signs full token, returns all context
  5. If no staff but dentist exists (legacy): looks for auto-migrated staff row
  6. If dentist + staff found: signs full V3 token
  7. If dentist but no staff: signs partial token (dentistId only), returns `needsClinic: true`
  8. If brand new user: creates dentist row, signs partial token, returns `isNewUser: true`
- **JWT shape (full V3):** `{ dentistId, staffId, clinicId, role }` — 30-day expiry
- **JWT shape (new/legacy user):** `{ dentistId }` — 30-day expiry, no clinic context
- **Returns (full):** `{ token, dentist, staff, clinic, isNewUser: false }`
- **Returns (needs setup):** `{ token, dentist, isNewUser: true }` or `{ token, dentist, isNewUser: false, needsClinic: true }`
- **Missing:** The `isNewUser: true` path creates a dentist but no staff row. The frontend must immediately call `create-clinic` or `join-clinic`, but there is no server-side enforcement of this — a new user can start calling patient endpoints with a partial token and `req.clinicId` will be undefined.

**Step 3 — Auth Middleware**
- **File:** `middleware/auth.js`
- **What it validates:** Bearer token signature against `JWT_SECRET`
- **What it injects into req:**
  - `req.dentistId` — always set from token
  - `req.staffId`, `req.clinicId`, `req.role` — set if token has them (V3) OR if DB lookup finds a staff row (backward compat)
- **Backward compat (old dentistId-only tokens):** Does a DB query to `staff` table on every request — **adds latency to every authenticated request**
- **Silent partial auth:** If a dentist has no staff row (new user mid-setup), middleware calls `next()` without setting `clinicId`. Routes that check `!req.clinicId` return 403, but routes that don't check silently operate without clinic context.
- **Fails when:** Token missing → 401; JWT invalid/expired → 401

**Multi-Clinic Flows:**
- `POST /api/auth/create-clinic` — Creates clinic + staff row + migrates existing data to new clinic_id. Signs new V3 token. Requires dentistId in token.
- `POST /api/auth/lookup-clinic` — Looks up clinic by join code (case-insensitive). Returns clinic info without auth. Requires auth.
- `POST /api/auth/join-clinic` — Creates staff row in target clinic. Signs new V3 token. Handles duplicate staff (unique constraint) gracefully.
- `GET /api/auth/me` — Returns dentist + staff + clinic data. Side effect: if clinic has no `join_code`, generates one. This is a GET endpoint with a write side-effect.

---

### 3.2 Auth Gaps

| Gap | Impact | Frontend Needs |
|-----|--------|----------------|
| No SMS provider | OTP auth is non-functional in production | Integrate MSG91, Twilio, or similar before go-live |
| No enforcement of clinic setup | New user can call patient endpoints immediately; clinicId is null, data saved without clinic scope | Frontend must guard routes; backend should reject writes without clinicId for certain endpoints |
| Backward compat DB query on every request | Every API call from old-token users hits the DB before the actual endpoint | Token refresh mechanism needed; old tokens should be invalidated after migration |
| `GET /me` has a write side-effect | Unexpected for a GET endpoint; could cause audit/log confusion | Move join_code generation to a dedicated POST or to clinic creation |
| Role not enforced by middleware | `req.role` is set but no endpoint currently checks it for access control | Role-based guards needed for doctor-only and receptionist-only operations |

---

## PART 4 — COMPLETE ENDPOINT INVENTORY

### 4.1 — Auth (`/api/auth`)
**File:** `routes/auth.routes.js`
**Controller:** `controllers/auth.controller.js`

---

#### `POST /api/auth/send-otp`
- **Description:** Generate and store an OTP for phone-based login
- **Auth:** Not required
- **Request body:** `{ phone: "string (10 digits)" }`
- **Supabase tables touched:** `otp_codes` (DELETE existing, INSERT new)
- **Returns (success):** `{ success: true, message: "OTP sent" }` — HTTP 200
- **Returns (error):** `{ error: "Valid 10-digit phone required" }` — HTTP 400
- **Known issues:** No SMS delivery — OTP is only stored in DB. No rate limiting specific to this endpoint (shared global 100 req/15 min limit).

---

#### `POST /api/auth/verify-otp`
- **Description:** Verify OTP and return JWT + user context
- **Auth:** Not required
- **Request body:** `{ phone: "string", otp: "string" }`
- **Supabase tables touched:** `otp_codes` (SELECT, UPDATE used=true), `staff` (SELECT), `clinics` (SELECT), `dentists` (SELECT, INSERT)
- **Returns (success, V3 user):** `{ token, dentist, staff, clinic, isNewUser: false }` — HTTP 200
- **Returns (success, new user):** `{ token, dentist, isNewUser: true }` — HTTP 200
- **Returns (success, needs clinic):** `{ token, dentist, isNewUser: false, needsClinic: true }` — HTTP 200
- **Returns (error):** `{ error: "Invalid or expired OTP" }` — HTTP 400
- **Known issues:** No brute-force protection on this endpoint. An attacker can try all 1,000,000 OTP combinations in 10 minutes against the 100 req/15 min rate limit (only 100 attempts before limit, so brute force IS rate-limited, but 6-digit OTP has 1/1,000,000 chance per attempt — acceptable).

---

#### `GET /api/auth/me`
- **Auth:** Required
- **Supabase tables touched:** `dentists` (SELECT), `staff` (SELECT), `clinics` (SELECT, UPDATE if join_code missing)
- **Returns:** `{ dentist, staff, clinic }` — HTTP 200
- **Known issues:** Write side-effect on a GET (generates join_code if missing).

---

#### `PUT /api/auth/profile`
- **Auth:** Required
- **Request body:** `{ name, clinic_name, phone }`
- **Supabase tables touched:** `dentists` (UPDATE), `staff` (UPDATE name if staffId present)
- **Returns:** `{ dentist }` — HTTP 200
- **Known issues:** No validation on phone field (could overwrite with invalid format). Updates `dentists.clinic_name` which is a legacy field — not the `clinics` table.

---

#### `POST /api/auth/create-clinic`
- **Auth:** Required (dentistId token)
- **Request body:** `{ clinicName, yourName, city?, phone? }`
- **Supabase tables touched:** `clinics` (INSERT, UPDATE owner), `staff` (INSERT), `dentists` (UPDATE), `patients/visits/appointments/treatment_plans/prescriptions/xrays` (UPDATE clinic_id on null records — 6 migration queries)
- **Returns:** `{ token, dentist, staff, clinic }` — HTTP 200
- **Known issues:** The 6 migration UPDATE queries are fired sequentially with no error handling — if any fails, the others still run. No rollback. The new `phone` field on staff is taken from `req.body.phone` which is unauthenticated/unverified.

---

#### `POST /api/auth/lookup-clinic`
- **Auth:** Required
- **Request body:** `{ joinCode }`
- **Supabase tables touched:** `clinics` (SELECT id, name, city, display_id)
- **Returns:** `{ clinic }` — HTTP 200 or `{ error }` — HTTP 404
- **Known issues:** None significant.

---

#### `POST /api/auth/join-clinic`
- **Auth:** Required (dentistId token)
- **Request body:** `{ joinCode, yourName, role: "doctor"|"receptionist" }`
- **Supabase tables touched:** `clinics` (SELECT), `dentists` (SELECT, UPDATE), `staff` (INSERT)
- **Returns:** `{ token, dentist, staff, clinic }` — HTTP 200
- **Known issues:** Any authenticated user can join any clinic if they know the join code. There is no invite confirmation from the clinic owner.

---

### 4.2 — Patients (`/api/patients`)
**File:** `routes/patients.routes.js`
**Controller:** `controllers/patients.controller.js`
**Auth required:** Yes (router-level `router.use(auth)`)

---

#### `GET /api/patients`
- **Description:** List all patients visible to this user
- **Query params:** `?q=string` (search by name or phone — ILIKE)
- **Supabase tables touched:** `patients` (SELECT with visits and appointments join), `patients` (UPDATE clinic_id backfill — side effect)
- **Returns:** `{ patients: [...] }` — HTTP 200. Each patient includes full `visits[]` and `appointments[]` arrays.
- **Known issues:**
  - **No pagination** — returns ALL patients with ALL their visits and appointments. A clinic with 2,000 patients and 20,000 visits could return a response over 10MB.
  - **Backfill side-effect on every list call** — runs an UPDATE on every GET /patients if clinicId is set. This fires on every list, adding unnecessary DB writes.
  - **ILIKE without index** — search on `name` and `phone` uses `ilike.%q%` — leading wildcard prevents index use. Full table scan on large datasets.

---

#### `POST /api/patients`
- **Description:** Create new patient
- **Request body:** `{ name*, phone*, age, gender, medical_conditions, allergies, clinical_flags }`
- **Supabase tables touched:** `patients` (INSERT)
- **Returns:** `{ patient }` — HTTP 201
- **Known issues:**
  - `clinical_flags` is destructured from `req.body` but **NOT included in the INSERT** (only `name, phone, age, gender, medical_conditions, allergies` are inserted). Clinical flags set on create are silently dropped.
  - No duplicate phone check — multiple patients with same phone number can be created.

---

#### `GET /api/patients/:id`
- **Description:** Get patient with full visit + appointment history
- **Supabase tables touched:** `patients` (SELECT with visits and appointments join)
- **Returns:** `{ patient }` — HTTP 200 or 404
- **Known issues:** Backfill side-effect (stamps clinic_id) fires on every getById call.

---

#### `PUT /api/patients/:id`
- **Description:** Update patient fields
- **Request body:** any fields to update
- **Supabase tables touched:** `patients` (UPDATE)
- **Returns:** `{ patient }` — HTTP 200
- **Known issues:** `...req.body` is spread directly into the UPDATE — no field whitelist. Any field name can be written to the patients table, including `dentist_id`, `clinic_id`, or internal flags.

---

#### `DELETE /api/patients/:id`
- **Description:** Soft-delete patient (sets `is_deleted: true`)
- **Returns:** `{ success: true }` — HTTP 200
- **Known issues:** None significant. Soft delete is the right approach.

---

#### `GET /api/patients/:id/tooth-history`
- **Description:** Structured tooth-by-tooth history with procedures and upcoming appointments
- **Auth:** Required
- **Supabase tables touched:** `visits` (SELECT), `appointments` (SELECT)
- **Returns:** `{ patientId, toothMap: [...], generalVisits: [...], totalBilled }` — HTTP 200
- **Known issues:**
  - Queries `visits` with `eq('dentist_id', req.dentistId)` — does NOT use `clinic_id`. In a multi-doctor clinic, receptionist or another doctor will not see visits logged by a different doctor.
  - Same issue for `appointments` query.

---

#### `GET /api/patients/:id/treatment-plans`
- **Description:** List all treatment plans for a patient
- **Supabase tables touched:** `treatment_plans` (SELECT)
- **Returns:** `{ plans: [...] }` — HTTP 200
- **Known issues:** Scoped by `dentist_id`, not `clinic_id` — multi-doctor gap.

---

#### `GET /api/patients/:id/prescriptions`
- **Description:** List all prescriptions for a patient
- **Supabase tables touched:** `prescriptions` (SELECT)
- **Returns:** `{ prescriptions: [...] }` — HTTP 200
- **Known issues:** Scoped by `dentist_id`, not `clinic_id` — multi-doctor gap.

---

#### `GET /api/patients/:id/xrays`
- **Description:** List all X-rays for a patient
- **Supabase tables touched:** `xrays` (SELECT)
- **Returns:** `{ xrays: [...] }` — HTTP 200
- **Known issues:** Scoped by `dentist_id`, not `clinic_id` — multi-doctor gap.

---

#### `GET /api/patients/:id/case-sheet`
- **Description:** Full aggregated case sheet — patient + plans + visits + prescriptions + xrays + upcoming appointments
- **Supabase tables touched:** `patients`, `treatment_plans`, `visits` (with `visit_notes` join), `prescriptions`, `xrays`, `appointments` (6 parallel queries)
- **Returns:** `{ patient, activeTreatmentPlans, allTreatmentPlans, visits, prescriptions, xrays, upcomingAppointments, summary }` — HTTP 200
- **Known issues:**
  - All 6 queries scope by `dentist_id` not `clinic_id` — multi-doctor gap.
  - No pagination on any sub-list — a patient with 10 years of records returns everything.
  - `visits` joins `visit_notes(*)` — the `*` returns all columns including large `raw_transcript` fields. Heavy response.

---

### 4.3 — Visits (`/api/visits`)
**File:** `routes/visits.routes.js`
**Controller:** `controllers/visits.controller.js`
**Auth required:** Yes

---

#### `GET /api/visits`
- **Query params:** `?patientId=UUID`
- **Supabase tables touched:** `visits` (SELECT)
- **Returns:** `{ visits: [...] }` — HTTP 200
- **Known issues:** No pagination. Returns ALL visits for the dentist (potentially thousands). No date range filter.

---

#### `POST /api/visits`
- **Request body:** `{ patientId, procedureName, toothNumber, status, rawTranscript, notes, medications, nextSteps, followUpDate, visitDate, cost, currency }`
- **Supabase tables touched:** `visits` (INSERT)
- **Returns:** `{ visit }` — HTTP 201
- **Known issues:** No `clinic_id` set on insert — visits created here have `clinic_id: null` until the backfill runs on next patient list call.

---

#### `GET /api/visits/:id`
- **Supabase tables touched:** `visits` (SELECT)
- **Returns:** `{ visit }` — HTTP 200
- **Known issues:** **CRITICAL DATA LEAKAGE** — no `dentist_id` filter. Any authenticated user can fetch ANY visit record by UUID. If a doctor from clinic A knows a visit UUID from clinic B, they can read it.

---

#### `PUT /api/visits/:id`
- **Request body:** any fields (mapped via fieldMap + passthrough)
- **Supabase tables touched:** `visits` (UPDATE)
- **Returns:** `{ visit }` — HTTP 200
- **Known issues:** **CRITICAL DATA LEAKAGE** — no `dentist_id` or `clinic_id` filter. Any authenticated user can update ANY visit record by UUID. Also spreads `req.body` through a partial field map — unmapped fields are passed raw to the DB.

---

### 4.4 — Appointments (`/api/appointments`)
**File:** `routes/appointments.routes.js`
**Controller:** `controllers/appointments.controller.js`
**Auth required:** Yes

---

#### `GET /api/appointments/today`
- **Supabase tables touched:** `appointments` (SELECT with patients join)
- **Returns:** `{ appointments: [...] }` — HTTP 200
- **Known issues:** Scoped by `dentist_id` not `clinic_id`.

---

#### `GET /api/appointments/upcoming`
- **Description:** Appointments for the next 7 days
- **Supabase tables touched:** `appointments` (SELECT with patients join)
- **Returns:** `{ appointments: [...] }` — HTTP 200
- **Known issues:** Scoped by `dentist_id` not `clinic_id`.

---

#### `GET /api/appointments/booked-slots`
- **Query params:** `?date=YYYY-MM-DD` (required — no default)
- **Supabase tables touched:** `appointments` (SELECT appointment_time only)
- **Returns:** `{ bookedSlots: ["09:00", "10:00", ...] }` — HTTP 200
- **Known issues:** If `date` param is not provided, Supabase returns all non-cancelled appointments (no date filter applied). Frontend must always send this param.

---

#### `GET /api/appointments`
- **Query params:** `?date=YYYY-MM-DD`
- **Supabase tables touched:** `appointments` (SELECT with patients join)
- **Returns:** `{ appointments: [...] }` — HTTP 200
- **Known issues:** No pagination. No date range — if no `date` param, returns all appointments ever for this dentist.

---

#### `POST /api/appointments`
- **Request body:** `{ patientId, appointmentDate, appointmentTime, purpose, toothNumber }`
- **Supabase tables touched:** `appointments` (INSERT)
- **Returns:** `{ appointment }` — HTTP 201
- **Known issues:** No `clinic_id` on insert. No validation of `appointmentDate` format. No duplicate slot check (two appointments at same time/date can be booked).

---

#### `PUT /api/appointments/:id`
- **Request body:** any fields
- **Supabase tables touched:** `appointments` (UPDATE)
- **Returns:** `{ appointment }` — HTTP 200
- **Known issues:** **DATA LEAKAGE** — no `dentist_id` or `clinic_id` filter. Any authenticated user can update any appointment. Spreads raw `req.body` into UPDATE.

---

### 4.5 — AI (`/api/ai`)
**File:** `routes/ai.routes.js`
**Controller:** `controllers/ai.controller.js`
**Auth required:** Yes (per-route)

---

#### `POST /api/ai/transcribe`
- **Description:** Upload audio, transcribe via Sarvam STT, store in Supabase Storage
- **Auth:** Required
- **Request:** `multipart/form-data` — field `audio` (file), `recordingType` (string, optional)
- **File size limit:** 25 MB (multer config)
- **Upload directory:** `/tmp/dental-uploads/`
- **Supabase tables touched:** `voice_recordings` (INSERT — non-fatal)
- **Supabase Storage buckets:** `voice-notes` (upload)
- **Returns (success):** `{ transcript: string, audioStoragePath, audioFileSizeKb }` — HTTP 200
- **Returns (no Sarvam key):** `{ transcript: "Root canal completed on tooth 26..." }` — mock response
- **Returns (Sarvam error):** `{ transcript: "", warning: "Sarvam error (status): message" }` — HTTP 200 (not an error status!)
- **Known issues:**
  - **Sarvam errors return HTTP 200** — the caller has no reliable way to detect transcription failure via status code.
  - Audio format detection relies on `req.file.originalname` — if filename is missing, defaults to `ogg`. Not always correct.
  - The content type sent to Sarvam for `.ogg`/`.webm` files is `audio/ogg`, which may cause Sarvam rejections for webm containers.

---

#### `POST /api/ai/generate-note`
- **Description:** Extract structured dental note from transcript using Gemini
- **Request body:** `{ transcript: string }`
- **External API:** Gemini `gemini-2.5-flash-lite` via REST
- **Returns:** `{ structured: { procedure, toothNumber, status, notes, medications, nextSteps, followUpDays, followUpDate, cost, currency, totalSittings, remainingSittings, isMultiSitting, treatmentPlanSuggested, assignedDoctor } }` — HTTP 200
- **Returns (no Gemini key):** `{ structured: mockNote(transcript) }` — mock data
- **Returns (Gemini error):** `{ structured: mockNote(transcript) }` — silently falls back, **no warning in response**
- **Known issues:**
  - Errors silently return mock data — caller cannot tell if Gemini succeeded.
  - `JSON.parse(text)` — if Gemini returns malformed JSON despite stripping code fences, this throws and triggers the mock fallback. No partial extraction.

---

#### `POST /api/ai/extract-complaint`
- **Description:** Extract and translate chief complaint to English (1 sentence)
- **Request body:** `{ transcript: string }`
- **External API:** Gemini `gemini-2.5-flash-lite`
- **Returns:** `{ complaint: string }` — HTTP 200
- **Returns (error/no key):** `{ complaint: transcript }` — passes through original text
- **Known issues:** No warning when Gemini fails — frontend gets original transcript instead of cleaned complaint.

---

#### `POST /api/ai/extract-patient`
- **Description:** Extract patient demographics from voice (name, age, gender, bloodGroup, conditions, allergies, medications)
- **Request body:** `{ transcript: string }`
- **External API:** Gemini `gemini-2.5-flash-lite`
- **Returns:** `{ patient: { name, age, gender, bloodGroup, conditions, allergies, medications } }` — HTTP 200
- **Known issues:** Returns `bloodGroup` (camelCase) while `extract-patient-info` returns `blood_group`... actually both return `bloodGroup`. However the schema here returns `conditions` as an array of strings, while `extract-patient-info` returns `flags` as a boolean object. These are two overlapping endpoints doing the same job with different output schemas.

---

#### `POST /api/ai/extract-patient-info`
- **Description:** Extract patient details including phone number and medical flags
- **Request body:** `{ transcript: string }`
- **External API:** Gemini `gemini-2.5-flash-lite`
- **Returns:** `{ name, age, phone, chiefComplaint, bloodGroup, flags: { hasDiabetes, hasHypertension, hasHeartCondition, isPregnant, isOnBloodThinners, penicillin, latex } }` — HTTP 200
- **Known issues:** Duplicates `extract-patient` with a different schema. Creates confusion about which endpoint to use for patient registration. The `flags` boolean object vs `conditions` string array discrepancy means frontend must handle two different response shapes.

---

#### `POST /api/ai/extract-prescription`
- **Description:** Extract prescription medicines from voice note
- **Request body:** `{ transcript: string }`
- **External API:** Gemini `gemini-2.5-flash-lite`
- **Returns:** `{ medicines: [{ name, dosage, frequency, duration, notes, uncertain }], instructions, followUpDays }` — HTTP 200
- **Known issues:**
  - The schema returned here (`dosage` field) differs from `ai.service.js` `extractPrescription()` which returns `dose` field. The `prescriptions.routes.js` POST and `queue.routes.js` complete-consult use `ai.service.js` not this controller endpoint — so the PDF generation and DB storage uses `dose` while this API endpoint returns `dosage`. Inconsistent medicine object shape.

---

### 4.6 — Analytics (`/api/analytics`)
**File:** `routes/analytics.routes.js`
**Auth required:** Yes (per-route)

---

#### `GET /api/analytics/dashboard`
- **Description:** Dashboard stats — today's appointments, completed visits, follow-ups, recent appointments
- **Supabase tables touched:** `appointments` (2x SELECT), `visits` (2x SELECT with patients join)
- **Returns:** `{ totalAppointmentsToday, upcomingToday, completedToday, pendingFollowUps, followups: [...], recentAppointments: [...] }` — HTTP 200
- **Known issues:**
  - All queries use `req.dentistId` — in a multi-staff clinic, each doctor sees only their own stats, never the whole clinic's.
  - `recentAppointments` has no date filter and `limit(5)` — returns the 5 most recently created/updated appointments, not today's. Could return old appointments.
  - No `clinic_id` filter — data is per-dentist, not per-clinic.

---

### 4.7 — Treatment Plans (`/api/treatment-plans`)
**File:** `routes/treatment-plans.routes.js`
**Auth required:** Yes (per-route)

---

#### `POST /api/treatment-plans`
- **Request body:** `{ patientId*, procedureName*, diagnosis, totalSittings, estimatedCost, notes, startDate, expectedEndDate }`
- **Supabase tables touched:** `treatment_plans` (INSERT)
- **Returns:** `{ plan }` — HTTP 201
- **Known issues:** No `clinic_id` on insert. Scoped only by `dentist_id`.

---

#### `GET /api/treatment-plans/:id`
- **Supabase tables touched:** `treatment_plans` (SELECT with visits and appointments joins)
- **Returns:** `{ plan }` (with nested visits and appointments) — HTTP 200 or 404
- **Known issues:** Join requests `visits(id, visit_date, sitting_number, ...)` and `appointments(..., sitting_number, ...)`. **`sitting_number` column likely does not exist** on either `visits` or `appointments` tables — Supabase will error or silently omit the field if the column is missing.

---

#### `PATCH /api/treatment-plans/:id`
- **Request body:** `{ completedSittings, collectedAmount, status, estimatedCost, notes }`
- **Supabase tables touched:** `treatment_plans` (UPDATE)
- **Returns:** `{ plan }` — HTTP 200
- **Known issues:** Does NOT update `pending_amount` when `estimatedCost` or `collectedAmount` changes. The `payments.routes.js` does update `pending_amount`, but this PATCH endpoint does not. `pending_amount` will drift out of sync if this endpoint is used to update amounts.

---

### 4.8 — Visit Notes (`/api/visits/:visitId/notes`)
**File:** `routes/visit-notes.routes.js`
**Auth required:** Yes (per-route)
**Note:** Registered at app level with `mergeParams: true`

---

#### `GET /api/visits/:visitId/notes`
- **Supabase tables touched:** `visit_notes` (SELECT)
- **Returns:** `{ notes: [...] }` — HTTP 200
- **Known issues:** No validation that the `visitId` belongs to the authenticated user — any user can list notes for any visit ID.

---

#### `POST /api/visits/:visitId/notes`
- **Request body:** `{ patientId, rawTranscript, structuredNote, procedureName, toothNumber, status, notes, medications, nextSteps, followUpDate, cost, audioStoragePath, audioFileSizeKb, audioDurationSec }`
- **Supabase tables touched:** `visit_notes` (SELECT count, INSERT)
- **Returns:** `{ note }` — HTTP 201
- **Known issues:** No validation that `visitId` belongs to the authenticated user. The `note_number` count query and INSERT are two separate operations — **race condition** if two notes are created for the same visit simultaneously; both could get `note_number = 1`.

---

### 4.9 — Prescriptions (`/api/prescriptions`)
**File:** `routes/prescriptions.routes.js`
**Auth required:** Yes

---

#### `POST /api/prescriptions`
- **Request body:** `{ patientId, visitId, visitNoteId, rawVoice, medicines, instructions }`
- **Supabase tables touched:** `prescriptions` (INSERT with patients join)
- **Returns:** `{ prescription: { ...data, follow_up: extractedFollowUp } }` — HTTP 201
- **Known issues:**
  - The `follow_up` field is appended client-side to the response object but **NOT saved to the DB** (there is no `follow_up` column in the INSERT). If the frontend refreshes this prescription from the DB, `follow_up` will be gone.
  - `extractPrescription` from `ai.service.js` uses `dose` field; here the prescription is stored with whatever medicines the AI returns — the DB `medicines` JSONB array may have inconsistent field names.

---

#### `GET /api/prescriptions/:id/pdf`
- **Description:** Stream prescription as PDF
- **Supabase tables touched:** `prescriptions` (SELECT with patients join), `staff` (SELECT with clinics join)
- **Returns:** PDF binary stream, `Content-Type: application/pdf`
- **Known issues:**
  - Uses `rx.follow_up` from the DB record, but `follow_up` is never saved to DB (see above). PDF will always show no follow-up.
  - If `req.staffId` is null (old token), the doctor/clinic header in the PDF defaults to `Doctor` / `DentAI Clinic`.

---

#### `GET /api/prescriptions/:id`
- **Supabase tables touched:** `prescriptions` (SELECT with patients and dentists join)
- **Returns:** `{ prescription }` — HTTP 200 or 404
- **Known issues:** Joins `dentists(name, clinic_name, phone)` — references the legacy `dentists` table which has a `clinic_name` field. This is a legacy path; new prescriptions should use staff/clinic join.

---

### 4.10 — X-Rays (`/api/xrays`)
**File:** `routes/xrays.routes.js`
**Auth required:** Yes

---

#### `POST /api/xrays`
- **Request:** `multipart/form-data` — field `file` (image), plus body fields
- **Request body:** `{ patientId*, visitId, xrayType, dateTaken, toothNumber, notes, remarks }`
- **File size limit:** 20 MB (multer config in this route)
- **Upload directory:** `/tmp/`
- **Supabase Storage buckets:** `xrays` (upload)
- **Supabase tables touched:** `xrays` (INSERT)
- **Returns:** `{ xray }` — HTTP 201
- **Known issues:**
  - No file type validation — any file format is accepted (PDF, EXE, etc.). Only labeled as `image/jpeg` in storage.
  - Storage path: `{dentistId}/{patientId}/{xrayType}_{Date.now()}` — no extension in the path before `uploadFile` adds one.
  - `uploadFile` always sets `contentType: 'image/jpeg'` for non-voice-notes. This is wrong for DICOM or PNG X-rays.

---

#### `GET /api/xrays/:id/url`
- **Supabase tables touched:** `xrays` (SELECT storage_path)
- **Returns:** `{ url, expiresIn: 3600 }` — HTTP 200
- **Known issues:** Signed URL expires in 1 hour. Frontend must re-request if image needs to stay accessible.

---

#### `DELETE /api/xrays/:id`
- **Supabase tables touched:** `xrays` (SELECT, DELETE), Supabase Storage `xrays` (delete)
- **Returns:** `{ success: true }` — HTTP 200
- **Known issues:** Delete from storage and delete from DB are two separate calls. If DB delete fails after storage delete, the DB record points to a non-existent file.

---

### 4.11 — Dataset (`/api/dataset`)
**File:** `routes/dataset.routes.js`
**Auth required:** Yes

---

#### `GET /api/dataset/stats`
- **Supabase tables touched:** `visit_notes` (SELECT), `visits` (SELECT), `voice_recordings` (SELECT)
- **Returns:** `{ totalRecordings, totalMb, fromVisitNotes, fromVisits, byType }` — HTTP 200
- **Known issues:** No `clinic_id` scope — scoped by `dentist_id`. In multi-staff clinics, each doctor sees only their own recordings.

---

#### `GET /api/dataset/export`
- **Query params:** `?format=json|csv`, `?includeUrls=true|false`, `?limit=number`, `?offset=number`
- **Supabase tables touched:** `visit_notes` (SELECT with pagination)
- **Returns:** JSON array or CSV download — HTTP 200
- **Known issues:**
  - Default `limit=500` — can return large payloads.
  - If `includeUrls=true`, generates a signed URL per record — **N+1 pattern** against Supabase Storage (up to 500 signed URL requests).
  - Integer parsing via `parseInt(offset)` with no NaN check — invalid offset param causes unexpected range behavior.

---

#### `GET /api/dataset/recordings`
- **Query params:** `?type=string`, `?limit=number`, `?offset=number`
- **Supabase tables touched:** `voice_recordings` (SELECT)
- **Returns:** `{ total, recordings: [...] }` — HTTP 200
- **Known issues:** Default `limit=200`. The `total` field returns `data?.length` which is the count of returned records (up to 200), not the true total count in the DB.

---

#### `GET /api/dataset/recordings/export`
- **Query params:** `?type`, `?format=json|csv`, `?includeUrls`, `?limit`, `?offset`
- **Supabase tables touched:** `voice_recordings` (SELECT)
- **Returns:** JSON or CSV — HTTP 200
- **Known issues:** Same N+1 signed URL issue as `/dataset/export`.

---

### 4.12 — Queue (`/api/queue`)
**File:** `routes/queue.routes.js`
**Auth required:** Yes (all routes check `req.clinicId`)

---

#### `GET /api/queue`
- **Description:** Today's full queue for the clinic
- **Supabase tables touched:** `queue_entries` (SELECT with patients, treatment_plans, added_by staff, assigned_doctor staff joins)
- **Returns:** `{ queue: [...] }` — HTTP 200
- **Returns (no clinicId):** `{ error: "No clinic context" }` — HTTP 403
- **Known issues:** Returns ALL entries for today's date — if a clinic has 50+ patients queued, this is a large response with 4 joined tables per entry.

---

#### `GET /api/queue/action-queue`
- **Description:** Receptionist view — entries with status `ready_for_checkout`, enriched with prescription flag and amount due
- **Supabase tables touched:** `queue_entries` (SELECT with joins), then `prescriptions` (SELECT count) per entry — **N+1 QUERY**
- **Returns:** `{ tasks: [...] }` — HTTP 200
- **Known issues:**
  - **N+1 query**: Does a `Promise.all` loop that fires one prescription count query per queue entry. For a clinic with 20 `ready_for_checkout` entries, this is 21 DB queries on one endpoint call.
  - The prescription check looks for any prescription created in the last 1 hour for this patient — this is a heuristic that can produce false positives (old prescription from earlier today counted).

---

#### `POST /api/queue`
- **Description:** Add patient to today's queue
- **Request body:** `{ patientId*, chiefComplaint, visitReason, priority, assignedDoctor, treatmentPlanId }`
- **Supabase tables touched:** `queue_entries` (SELECT count, INSERT with joins)
- **Returns:** `{ entry }` — HTTP 201
- **Known issues:** Token number generation (count + 1) is not atomic — race condition if two patients are added simultaneously.

---

#### `PATCH /api/queue/:id`
- **Description:** Update queue entry (status, outcome, assigned doctor, sort order, notes)
- **Request body:** `{ status, consultationOutcome, outcomeMetadata, assignedDoctor, priority, sortOrder, notes }`
- **Supabase tables touched:** `queue_entries` (UPDATE)
- **Returns:** `{ entry }` — HTTP 200
- **Known issues:** If `req.clinicId` is undefined (old token, no clinic context), the `.eq('clinic_id', req.clinicId)` filter matches nothing — the UPDATE silently affects 0 rows and returns null. No error is thrown; the 200 response has an empty `entry`.

---

#### `PATCH /api/queue/:id/reorder`
- **Description:** Move a queue entry up or down
- **Request body:** `{ direction: "up"|"down" }`
- **Supabase tables touched:** `queue_entries` (SELECT, 2x UPDATE in parallel)
- **Returns:** `{ success: true }` — HTTP 200
- **Known issues:** The two sort_order UPDATEs are parallel but not atomic — if one fails, sort_order is corrupted.

---

#### `POST /api/queue/:id/complete-consult`
- *(Documented in full detail in Part 9)*

---

#### `DELETE /api/queue/:id`
- **Supabase tables touched:** `queue_entries` (DELETE)
- **Returns:** `{ success: true }` — HTTP 200
- **Known issues:** Hard delete — no soft delete or audit trail.

---

#### `GET /api/queue/:id/context`
- **Description:** Pre-consultation context: patient details, active plans, last visit, today's xrays
- **Supabase tables touched:** `queue_entries` (SELECT with joins), `treatment_plans` (SELECT), `visits` (SELECT), `xrays` (SELECT)
- **Returns:** `{ queueEntry, patient, activePlans, lastVisit, todayXrays, pendingBalance }` — HTTP 200
- **Known issues:** `visits` and `xrays` queries do NOT filter by `clinic_id` or `dentist_id` — any patient's last visit and today's xrays are returned regardless of who created them.

---

### 4.13 — Staff (`/api/staff`)
**File:** `routes/staff.routes.js`
**Auth required:** Yes

---

#### `GET /api/staff`
- **Description:** All active staff in this clinic
- **Supabase tables touched:** `staff` (SELECT)
- **Returns:** `{ staff: [...] }` — HTTP 200
- **Returns (no clinicId):** `{ error: "No clinic context" }` — HTTP 403

---

#### `GET /api/staff/me`
- **Description:** Current user's staff record
- **Supabase tables touched:** `staff` (SELECT *)
- **Returns:** `{ staff }` — HTTP 200
- **Known issues:** Returns `SELECT *` — exposes all staff columns including any sensitive internal fields.

---

### 4.14 — Clinic (`/api/clinic`)
**File:** `routes/clinic.routes.js`
**Auth required:** Yes

---

#### `GET /api/clinic`
- **Supabase tables touched:** `clinics` (SELECT *)
- **Returns:** `{ clinic }` — HTTP 200 or 404
- **Known issues:** Returns `SELECT *` — includes `join_code` in the response. Any authenticated staff member can see the join code and share it to add unauthorized staff.

---

#### `PATCH /api/clinic`
- **Request body:** `{ name, city, address, phone, openTime, closeTime, workingDays }`
- **Supabase tables touched:** `clinics` (UPDATE)
- **Returns:** `{ clinic }` — HTTP 200
- **Known issues:** No role check — a receptionist can update clinic settings (name, address, hours). Should be restricted to `doctor` or `owner` role.

---

### 4.15 — Payments (`/api/payments`)
**File:** `routes/payments.routes.js`
**Auth required:** Yes

---

#### `POST /api/payments`
- **Description:** Record a payment and sync treatment plan balances
- **Request body:** `{ patientId*, amount*, treatmentPlanId, queueEntryId, paymentMethod, notes, paymentDate }`
- **Supabase tables touched:** `payments` (INSERT), `treatment_plans` (SELECT, UPDATE — if treatmentPlanId provided)
- **Returns:** `{ payment }` — HTTP 201
- **Known issues:**
  - The treatment plan balance sync (SELECT then UPDATE) is not atomic — race condition if two payments are recorded simultaneously for the same plan.
  - `collected_amount` on `treatment_plans` is updated but no validation that `newCollected` doesn't exceed `estimated_cost` (overpayment not flagged).

---

#### `GET /api/payments/patient/:patientId`
- **Supabase tables touched:** `payments` (SELECT with staff and treatment_plans join)
- **Returns:** `{ payments: [...], total }` — HTTP 200
- **Known issues:** No date range filter — returns ALL payments for a patient ever.

---

#### `GET /api/payments/plan/:planId`
- **Supabase tables touched:** `payments` (SELECT with staff join)
- **Returns:** `{ payments: [...], total }` — HTTP 200

---

### 4.16 — Health Check
#### `GET /health`
- **Auth:** Not required
- **Returns:** `{ status: "ok", timestamp: "ISO string" }` — HTTP 200

---

## PART 5 — DATABASE SCHEMA (AS-IS)

Tables inferred from code queries. No direct schema inspection was performed — this reflects what the code reads/writes.

### 5.1 — `otp_codes`
**Referenced in:** `controllers/auth.controller.js`
**Purpose:** Stores short-lived OTP codes for phone authentication

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| phone | text | No | 10-digit phone number |
| code | text | No | 6-digit OTP |
| expires_at | timestamptz | No | 10 min TTL from creation |
| used | boolean | No | Default false |

---

### 5.2 — `dentists`
**Referenced in:** `controllers/auth.controller.js`, `routes/prescriptions.routes.js`
**Purpose:** Legacy user table — pre-dates multi-staff architecture. Still in use for backward compat.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| phone | text | No | |
| name | text | Yes | |
| clinic_name | text | Yes | Legacy field — referenced by prescriptions join |
| updated_at | timestamptz | Yes | |

**Columns read but may not exist:**
- `clinic_name` — joined in `prescriptions.routes.js:89` as `dentists(name, clinic_name, phone)`. If this column was dropped, that query will error.

---

### 5.3 — `staff`
**Referenced in:** `middleware/auth.js`, `controllers/auth.controller.js`, `routes/staff.routes.js`, `routes/prescriptions.routes.js`, `routes/queue.routes.js`
**Purpose:** Multi-clinic staff registry — doctor and receptionist roles

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| clinic_id | UUID | No | FK → clinics.id |
| dentist_id | UUID | Yes | FK → dentists.id (legacy link) |
| phone | text | No | |
| name | text | No | |
| role | text | No | 'doctor' or 'receptionist' |
| status | text | No | 'active' or other |
| created_at | timestamptz | Yes | |

**Unique constraint:** `(clinic_id, dentist_id)` — inferred from error code `23505` handling in `joinClinic`

---

### 5.4 — `clinics`
**Referenced in:** `controllers/auth.controller.js`, `routes/clinic.routes.js`, `routes/prescriptions.routes.js`
**Purpose:** Clinic registry

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| name | text | No | |
| city | text | Yes | |
| join_code | text | Yes | 6-char code for staff onboarding |
| display_id | text | Yes | e.g. DENT-CHN-423 |
| owner_staff_id | UUID | Yes | FK → staff.id |
| address | text | Yes | |
| phone | text | Yes | |
| open_time | text | Yes | |
| close_time | text | Yes | |
| working_days | text/array | Yes | |

---

### 5.5 — `patients`
**Referenced in:** `controllers/patients.controller.js`, `routes/patients.routes.js`, `routes/queue.routes.js`
**Purpose:** Patient records per clinic

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| dentist_id | UUID | No | FK → dentists.id |
| clinic_id | UUID | Yes | FK → clinics.id (null for legacy records) |
| name | text | No | |
| phone | text | No | |
| age | integer | Yes | |
| gender | text | Yes | |
| medical_conditions | text/JSONB | Yes | |
| allergies | text/JSONB | Yes | |
| clinical_flags | JSONB | Yes | **Queried in queue.routes.js but NOT set on patient create** |
| is_deleted | boolean | No | Default false |
| updated_at | timestamptz | Yes | |

**Columns the code reads but may not exist:**
- `clinical_flags` — queried in `queue_entries` SELECT join (`:patients(id, name, phone, age, gender, allergies, clinical_flags)`) but never written by `patients.controller.js create`. If column doesn't exist, Supabase returns an error on the queue GET endpoint.

---

### 5.6 — `visits`
**Referenced in:** `controllers/visits.controller.js`, `routes/patients.routes.js`, `routes/treatment-plans.routes.js`, `routes/analytics.routes.js`
**Purpose:** Completed visit records

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| clinic_id | UUID | Yes | Not set on insert via visits.controller.js |
| procedure_name | text | Yes | |
| tooth_number | text | Yes | |
| status | text | Yes | Default 'completed' |
| raw_transcript | text | Yes | |
| notes | text | Yes | |
| medications | text | Yes | |
| next_steps | text | Yes | |
| follow_up_date | date | Yes | |
| follow_up_done | boolean | Yes | Used in analytics query |
| visit_date | date | No | |
| cost | numeric | Yes | |
| currency | text | Yes | Default 'INR' |
| audio_storage_path | text | Yes | |
| audio_file_size_kb | integer | Yes | |
| updated_at | timestamptz | Yes | |

**Columns the code reads but may not exist:**
- `sitting_number` — queried in `treatment-plans.routes.js:34` as part of visits join. If missing, Supabase silently omits the field.
- `audio_uploaded_at` — used by `cleanup.job.js` for cutoff filtering. If missing, cleanup job returns 0 records and does nothing.

---

### 5.7 — `appointments`
**Referenced in:** `controllers/appointments.controller.js`, `routes/patients.routes.js`, `routes/queue.routes.js`
**Purpose:** Scheduled future appointments

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| clinic_id | UUID | Yes | Not set on insert |
| appointment_date | date | No | |
| appointment_time | time | No | |
| purpose | text | Yes | |
| tooth_number | text | Yes | |
| status | text | Yes | Default 'scheduled' |
| updated_at | timestamptz | Yes | |

**Columns the code reads but may not exist:**
- `sitting_number` — queried in `treatment-plans.routes.js:34`. Same issue as visits.

---

### 5.8 — `treatment_plans`
**Referenced in:** `routes/treatment-plans.routes.js`, `routes/queue.routes.js`, `routes/payments.routes.js`, `controllers/auth.controller.js`
**Purpose:** Multi-sitting treatment plans per patient

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| clinic_id | UUID | Yes | |
| diagnosis | text | Yes | |
| procedure_name | text | No | |
| total_sittings | integer | No | Default 1 |
| completed_sittings | integer | No | Default 0 |
| estimated_cost | numeric | Yes | |
| collected_amount | numeric | Yes | Default 0 |
| pending_amount | numeric | Yes | **Denormalized derived column — can drift out of sync** |
| notes | text | Yes | |
| start_date | date | Yes | |
| expected_end_date | date | Yes | |
| status | text | Yes | 'active', 'completed', etc. |
| updated_at | timestamptz | Yes | |
| created_at | timestamptz | No | |

---

### 5.9 — `prescriptions`
**Referenced in:** `routes/prescriptions.routes.js`, `routes/queue.routes.js`
**Purpose:** Prescription records with AI-extracted medicines

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| clinic_id | UUID | Yes | Not set on insert |
| visit_id | UUID | Yes | FK → visits.id |
| visit_note_id | UUID | Yes | FK → visit_notes.id |
| queue_entry_id | UUID | Yes | FK → queue_entries.id |
| raw_voice | text | Yes | |
| medicines | JSONB | Yes | Array of medicine objects |
| instructions | text | Yes | |
| created_at | timestamptz | No | |

**Columns the code reads but may not exist:**
- `follow_up` — referenced in `prescriptions.routes.js:75` as `rx.follow_up`. Never inserted. Will always be null/undefined. PDF follow-up field will always be blank.

---

### 5.10 — `xrays`
**Referenced in:** `routes/xrays.routes.js`, `routes/patients.routes.js`
**Purpose:** X-ray file references and metadata

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| visit_id | UUID | Yes | FK → visits.id |
| xray_type | text | Yes | Default 'OPG' |
| storage_path | text | No | Supabase Storage path |
| file_size_kb | integer | Yes | |
| date_taken | date | No | |
| tooth_number | text | Yes | |
| notes | text | Yes | |
| remarks | text | Yes | |

---

### 5.11 — `visit_notes`
**Referenced in:** `routes/visit-notes.routes.js`, `routes/dataset.routes.js`, `jobs/cleanup.job.js`
**Purpose:** Per-consultation sub-notes (multiple notes per visit)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| visit_id | UUID | No | FK → visits.id |
| patient_id | UUID | No | FK → patients.id |
| dentist_id | UUID | No | FK → dentists.id |
| note_number | integer | No | Sequential per visit |
| raw_transcript | text | Yes | |
| structured_note | JSONB | Yes | |
| procedure_name | text | Yes | |
| tooth_number | text | Yes | |
| status | text | Yes | Default 'completed' |
| notes | text | Yes | |
| medications | text | Yes | |
| next_steps | text | Yes | |
| follow_up_date | date | Yes | |
| cost | numeric | Yes | |
| audio_storage_path | text | Yes | |
| audio_file_size_kb | integer | Yes | |
| audio_duration_sec | integer | Yes | |
| audio_uploaded_at | timestamptz | Yes | Used by cleanup job |

---

### 5.12 — `queue_entries`
**Referenced in:** `routes/queue.routes.js`
**Purpose:** Daily patient queue per clinic

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| clinic_id | UUID | No | FK → clinics.id |
| patient_id | UUID | No | FK → patients.id |
| treatment_plan_id | UUID | Yes | FK → treatment_plans.id |
| added_by | UUID | Yes | FK → staff.id |
| assigned_doctor | UUID | Yes | FK → staff.id |
| chief_complaint | text | Yes | |
| visit_reason | text | Yes | |
| priority | text | Yes | Default 'normal' |
| queue_date | date | No | |
| token_number | integer | No | |
| sort_order | integer | Yes | |
| status | text | No | 'waiting', 'in_consultation', 'ready_for_checkout', etc. |
| consultation_outcome | text | Yes | |
| outcome_metadata | JSONB | Yes | |
| notes | text | Yes | |
| updated_at | timestamptz | Yes | |

---

### 5.13 — `voice_recordings`
**Referenced in:** `controllers/ai.controller.js`, `routes/dataset.routes.js`
**Purpose:** Dataset collection — labeled audio + transcript pairs

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| dentist_id | UUID | No | FK → dentists.id |
| recording_type | text | Yes | e.g. 'general', 'prescription' |
| transcript | text | Yes | |
| audio_path | text | Yes | Supabase Storage path |
| audio_size_kb | integer | Yes | |
| patient_id | UUID | Yes | |
| created_at | timestamptz | No | |

---

### 5.14 — `payments`
**Referenced in:** `routes/payments.routes.js`
**Purpose:** Payment records per clinic

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | No | PK |
| clinic_id | UUID | Yes | FK → clinics.id |
| patient_id | UUID | No | FK → patients.id |
| treatment_plan_id | UUID | Yes | FK → treatment_plans.id |
| queue_entry_id | UUID | Yes | FK → queue_entries.id |
| received_by | UUID | Yes | FK → staff.id |
| amount | numeric | No | |
| payment_method | text | Yes | Default 'cash' |
| notes | text | Yes | |
| payment_date | date | No | |
| created_at | timestamptz | No | |

---

## PART 6 — SERVICES ANALYSIS

### 6.1 — `ai.service.js`

**Purpose:** Shared AI extraction utility — used by `prescriptions.routes.js` and `queue.routes.js complete-consult`
**External APIs:** Google Gemini `gemini-2.5-flash-lite` via REST (axios)
**Functions exported:** `extractPrescription(voiceText)`

#### `extractPrescription(voiceText)`
- **Input:** `string` — dentist's voice note text
- **What it does:** Sends prompt to Gemini to extract structured prescription data
- **Returns:** `{ medicines: [...], instructions, followUp }` where each medicine has `{ name, dose, frequency, duration, timing, instructions, meal_timing_slots }`
- **Error handling:** try-catch returns hardcoded fallback medicine array on any error
- **Fallback behaviour:** Returns mock Amoxicillin + Ibuprofen prescription with message "Extraction failed — please add medicines manually"
- **Issues:**
  - **Field name mismatch**: Returns `dose` (not `dosage`). The `ai.controller.js` `extractPrescription` endpoint returns `dosage`. Two extraction paths return different field names for the same concept — the DB medicines JSONB will have inconsistent schemas depending on which path was used.
  - Silently falls back — caller cannot distinguish successful extraction from fallback.

---

### 6.2 — `storage.service.js`

**Purpose:** Supabase Storage upload, signed URL generation, and file deletion
**External APIs:** Supabase Storage API
**Functions exported:** `uploadFile`, `getSignedUrl`, `deleteFile`

#### `uploadFile(localPath, bucket, storagePath)`
- **Input:** local file path, bucket name, target storage path (no extension)
- **What it does:** Reads file into buffer, appends extension, uploads to Supabase Storage
- **Returns:** `{ storagePath: string, sizeKb: number }`
- **Error handling:** Throws on upload error; caller is responsible for cleanup
- **Issues:**
  - **`fs.readFileSync(localPath)`** — loads entire file into Node.js heap. A 25 MB audio file occupies 25 MB of RAM per request. Under concurrent load this is a serious memory issue.
  - Content type logic is simplistic: `voice-notes` → `audio/mp4`, everything else either `application/pdf` or `image/jpeg`. PNG X-rays uploaded as JPEG will have wrong content type.
  - `upsert: false` — if the same path is uploaded twice (e.g. same `Date.now()` collision), upload fails.

#### `getSignedUrl(bucket, storagePath, expiresIn)`
- **Returns:** signed URL string
- **Issues:** None significant.

#### `deleteFile(bucket, storagePath)`
- **Issues:** Errors are only logged, not thrown. Callers cannot detect delete failures.

---

### 6.3 — `pdf.service.js`

**Purpose:** Generate prescription PDF as a Buffer
**External APIs:** None (uses pdfkit locally)
**Functions exported:** `generatePrescriptionPdf`

#### `generatePrescriptionPdf({ patient, doctor, date, medicines, instructions, followUp })`
- **Input:** Patient + doctor objects, date string, medicines array, instructions string, optional followUp string
- **What it does:** Generates a formatted A4 PDF with medicine table (BF/Lunch/Dinner checkboxes), instructions, follow-up, and signature lines
- **Returns:** `Promise<Buffer>`
- **Error handling:** Promise rejects on pdfkit error; caller must handle
- **Issues:**
  - Relies on `med.meal_timing_slots` or falls back to `deriveSlots(timing, frequency)`. The `meal_timing_slots` field comes from the medicines array — if medicines were stored via the old `ai.controller.js` `extractPrescription` path (which returns `dosage`, `frequency` as abbreviations like `TDS`), `deriveSlots` handles this correctly. If medicines were stored via `ai.service.js` path (returns human-readable `frequency` like "Three times daily"), `deriveSlots` also handles this. Both paths work.
  - The PDF uses embedded Helvetica — no custom font. Non-ASCII characters (Tamil, Hindi in instructions) will render as boxes or be dropped.

---

## PART 7 — AI PIPELINE ANALYSIS

### 7.1 Sarvam AI (Speech-to-Text)

- **Endpoint called:** `https://api.sarvam.ai/speech-to-text`
- **Auth method:** Header `api-subscription-key: {SARVAM_API_KEY}`
- **Request format:** `multipart/form-data` — fields: `file` (audio binary), `model` (string), `language_code` (string), `with_timestamps` (boolean-as-string)
- **Model:** `saarika:v2.5`
- **Language:** `en-IN` (handles Tamil+English code-mixing)
- **Response format:** `{ transcript: string, ... }`
- **How transcript is extracted:** `response.data.transcript`
- **Error handling:** Caught in try-catch; error returns `{ transcript: "", warning: "..." }` with HTTP 200
- **Fallback:** If `SARVAM_API_KEY` is not set or equals the placeholder, returns hardcoded mock transcript
- **Issues:**
  - Errors return HTTP 200 — frontend cannot use status code to detect failure
  - webm files (Chrome recording format) are relabeled as `ogg` — this works if Sarvam accepts webm-in-ogg-container, but is technically incorrect and may cause failures with certain audio encodings
  - `timeout: 30000` — 30s timeout. Long audio files may hit this on slow connections

### 7.2 Gemini (Note Structuring)

- **Used via:** `controllers/ai.controller.js` (direct REST), `services/ai.service.js` (direct REST)
- **Model:** `gemini-2.5-flash-lite`
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}`
- **Auth method:** API key in query param (URL-visible, logged by proxy/WAF)

**System prompt for `generate-note`:**
```
You are a dental clinical AI assistant. Today's date is {today}.
Extract structured information from a dentist's voice note and return ONLY valid JSON with this exact schema:
{
  "procedure": "string",
  "toothNumber": "string or null (FDI tooth number...)",
  "status": "completed|in_progress|pending",
  "notes": "string",
  "medications": "string or null",
  "nextSteps": "string or null",
  "followUpDays": "number or null",
  "followUpDate": "YYYY-MM-DD or null",
  "cost": "number or null",
  "currency": "string (default 'INR')",
  "totalSittings": "number or null",
  "remainingSittings": "number or null",
  "isMultiSitting": "boolean",
  "treatmentPlanSuggested": "boolean",
  "assignedDoctor": "string or null"
}
```
- **Input format:** Transcript text as user content
- **Output JSON parsing:** `JSON.parse(text)` after stripping markdown fences
- **Error handling:** Any exception → returns `mockNote(transcript)` with no warning
- **Issues:**
  - Silent fallback to mock data — caller cannot tell if extraction succeeded
  - API key in URL query param — will appear in Sarvam/Gemini server logs, reverse proxies, and browser devtools
  - `maxOutputTokens: 1024` — could truncate long prescriptions in `extractPrescription`

### 7.3 Complaint Extraction

- **Endpoint:** `POST /api/ai/extract-complaint`
- **Model:** `gemini-2.5-flash-lite`
- **Prompt:** Extracts chief complaint to one clear English sentence (max 15 words). Handles Tamil/English/Tanglish.
- **Output schema:** Plain text string (not JSON)
- **Fallback:** Returns original transcript unchanged

### 7.4 Prescription Extraction

Two separate implementations exist:

**Via `POST /api/ai/extract-prescription` (controller endpoint, used directly by frontend):**
- Output schema: `{ medicines: [{ name, dosage, frequency, duration, notes, uncertain }], instructions, followUpDays }`
- Field: `dosage`

**Via `ai.service.js extractPrescription()` (used by prescriptions.routes.js and complete-consult):**
- Output schema: `{ medicines: [{ name, dose, frequency, duration, timing, instructions, meal_timing_slots }], instructions, followUp }`
- Field: `dose`
- More detailed — includes `meal_timing_slots` for PDF generation

**Issues:**
- **Two incompatible schemas** for the same concept. The DB `prescriptions.medicines` JSONB column will contain objects with either `dosage` or `dose` depending on which path was used. Frontend reading this field must handle both.
- `maxOutputTokens: 1500` for service vs `1024` for controller — inconsistent.

### 7.5 AI Pipeline Issues

| Issue | File | Line | Severity | Description |
|-------|------|------|----------|-------------|
| GEMINI_API_KEY missing from .env.example | .env.example | — | Critical | New developers get no AI — all endpoints return mock data silently |
| API key in URL query param | ai.controller.js | 150,198,246,314,373; ai.service.js:56 | High | Key appears in server logs, reverse proxy logs, and WAF logs |
| Silent fallback to mock data | ai.controller.js | 169,206 | High | No way for frontend to know Gemini failed — shows fake data as real |
| Sarvam errors return HTTP 200 | ai.controller.js | 100-108 | High | Frontend must check `warning` field, not status code |
| Two incompatible prescription schemas | ai.controller.js:330 vs ai.service.js:24 | — | High | DB medicines JSONB has inconsistent field names (`dose` vs `dosage`) |
| Whole file in memory via readFileSync | services/storage.service.js | 6 | High | 25MB audio file = 25MB heap per concurrent request |
| No rate limiting on AI endpoints | server.js:17 | — | Medium | 100 req/15 min shared with all API routes — AI endpoints could exhaust this |
| No SMS provider | auth.controller.js | 47-48 | Critical | OTP only stored in DB — never actually sent to user's phone |

---

## PART 8 — STORAGE ANALYSIS

### 8.1 Supabase Storage Buckets

| Bucket Name | Referenced In | Upload Endpoint | Size Limit | Access |
|-------------|---------------|----------------|-----------|--------|
| `voice-notes` | ai.controller.js, services/storage.service.js, jobs/cleanup.job.js, routes/dataset.routes.js | `POST /api/ai/transcribe` | 25 MB (multer) | Private |
| `xrays` | routes/xrays.routes.js, services/storage.service.js | `POST /api/xrays` | 20 MB (multer) | Private |

---

### 8.2 File Upload Flow

**voice-notes (audio):**
- Library: multer → saves to `/tmp/dental-uploads/`
- Upload: `storageService.uploadFile(path, 'voice-notes', 'recordingType/dentistId/tmp_timestamp')`
- File size limit: 25 MB
- File type validation: None — any file accepted
- `fs.readFileSync` loads whole file into memory
- Temp file cleaned up with `fs.unlinkSync` after upload (in both success and catch paths)
- Content type: `audio/mp4` (hardcoded regardless of actual format)
- Signed URL expiry: 86400 seconds (24 hours) for dataset exports

**xrays (images):**
- Library: multer → saves to `/tmp/`
- Upload: `storageService.uploadFile(path, 'xrays', 'dentistId/patientId/xrayType_timestamp')`
- File size limit: 20 MB
- File type validation: None — any file accepted
- Content type: `image/jpeg` (hardcoded regardless of actual format)
- Temp file cleaned up in success path and in catch
- Signed URL expiry: 3600 seconds (1 hour)

---

### 8.3 Storage Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| No file type validation on xray upload | High | Any file format accepted and stored — potential for non-image files to be stored as "xrays" |
| Content type hardcoded as image/jpeg | Medium | PNG, DICOM, or other formats get wrong content type in storage |
| `fs.readFileSync` loads whole file to memory | High | 25 MB files per request; 10 concurrent uploads = 250 MB heap spike |
| Storage delete not fatal | Medium | `deleteFile` only logs errors — xray record can exist pointing to deleted file |
| Voice notes content type always `audio/mp4` | Low | webm/ogg files stored with incorrect MIME type |

---

## PART 9 — QUEUE MANAGEMENT ANALYSIS

### 9.1 Queue Endpoints Summary

See Part 4.12 for full endpoint documentation.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/queue` | Today's full queue |
| `GET /api/queue/action-queue` | Receptionist checkout list (N+1 issue) |
| `POST /api/queue` | Add patient to queue |
| `PATCH /api/queue/:id` | Update entry status/outcome |
| `PATCH /api/queue/:id/reorder` | Swap sort_order of two entries |
| `POST /api/queue/:id/complete-consult` | Create treatment plan + appointments + prescription |
| `DELETE /api/queue/:id` | Hard-delete entry |
| `GET /api/queue/:id/context` | Pre-consultation patient context |

---

### 9.2 `complete-consult` Endpoint (Critical Path)

**Endpoint:** `POST /api/queue/:id/complete-consult`

**What it creates (in order):**

1. **`treatment_plans` INSERT** (FATAL if fails — throws and returns 500)
   - Sets: `patient_id, dentist_id, diagnosis, procedure_name, total_sittings, completed_sittings: 1, estimated_cost, collected_amount: 0, status: 'active', start_date: today`
   - Does NOT set: `clinic_id` — treatment plan has no clinic context

2. **`appointments` INSERT** (NON-FATAL — logged, continues on failure)
   - Creates one appointment stub per remaining sitting (sessions 2..N)
   - Each stub: date = today + (i-1)*7 days, time = hardcoded `'10:00'`, status = `'scheduled'`
   - Does NOT set: `clinic_id`

3. **Gemini `extractPrescription` + `prescriptions` INSERT** (NON-FATAL — logged, continues on failure)
   - Only runs if `transcript` field is provided in request body
   - Sets: `queue_entry_id: req.params.id` (good — links back to queue entry)

4. **`queue_entries` UPDATE** (SILENT failure — no error check)
   - Sets: `treatment_plan_id: plan.id`
   - If this fails (e.g. clinicId mismatch), the treatment plan exists but is never linked to the queue entry

**Transaction handling:** There is NO transaction. Supabase JS client does not support client-side transactions. If step 1 succeeds and step 4 fails, the treatment plan is orphaned. No rollback mechanism exists.

**Input shape:**
```json
{
  "patientId": "UUID (required)",
  "procedure": "string (required)",
  "diagnosis": "string",
  "toothNumber": "string",
  "totalSittings": "number",
  "estimatedCost": "number",
  "transcript": "string",
  "notes": "string"
}
```

**Output shape:**
```json
{
  "plan": { ...treatment_plan_row },
  "appointments": [...appointment_rows],
  "prescription": { ...prescription_row } | null
}
```

**Issues:**
- No `clinic_id` on treatment plan or appointment inserts
- Appointments hardcoded to `'10:00'` — patient not informed, just guessed
- No visit record created — today's consultation session is not recorded in `visits`
- No `completed_sittings` tracking per appointment (no sitting_number linkage)
- Queue entry update has no error check — silent failure

---

### 9.3 Realtime Considerations

- **Does the backend emit realtime events?** The Supabase client is initialized with `realtime: { transport: ws }` — but no `supabase.channel()` subscriptions are created server-side. The backend does NOT push events.
- **Realtime must be enabled via Supabase Dashboard** on the `queue_entries` table for the frontend to receive live queue updates.
- **Tables that need Realtime enabled** for multi-staff live sync:
  - `queue_entries` — doctor and receptionist must see the same queue state in real time
  - `prescriptions` — receptionist needs to know when doctor issues prescription
  - `payments` — optional, for balance sync

---

## PART 10 — MULTI-CLINIC ARCHITECTURE

### 10.1 How `clinic_id` is enforced

**In auth middleware:**
- V3 tokens: `req.clinicId` is set from JWT payload directly
- Old tokens: `req.clinicId` is set by a DB lookup on `staff` table
- If no staff row: `req.clinicId` is undefined — no 401/403 raised

**In controllers/routes:**

| Route Group | Uses `clinic_id` for queries? | Uses `dentist_id` fallback? |
|-------------|------------------------------|----------------------------|
| queue.routes | Yes — all queries require `clinic_id` | No |
| staff.routes | Yes | No |
| clinic.routes | Yes | No |
| payments.routes | Yes | No |
| patients (list) | Yes (when set), else `dentist_id` | Yes |
| visits | No — uses `dentist_id` only | — |
| appointments | No — uses `dentist_id` only | — |
| treatment-plans | No — uses `dentist_id` only | — |
| analytics | No — uses `dentist_id` only | — |
| prescriptions | Uses `dentist_id` only | — |
| xrays | Uses `dentist_id` only | — |
| dataset | Uses `dentist_id` only | — |

**Data leakage gaps:** `visits.controller.js getById` and `update` have NO owner filter at all (see Part 4.3). A user from Clinic A can access visits from Clinic B if they know the UUID.

---

### 10.2 Staff Roles

- `req.role` is set to `'doctor'` or `'receptionist'` in the auth middleware
- **No endpoint currently checks `req.role`** for access control
- `PATCH /api/clinic` — should be restricted to `doctor`/owner but is not
- `POST /api/queue/:id/complete-consult` — should be restricted to `doctor` but is not
- `GET /api/queue/action-queue` — should be restricted to `receptionist` or `all`, but is not
- Role data is available but unused

---

### 10.3 Multi-Clinic Gaps

| Gap | Risk Level | Description |
|-----|------------|-------------|
| `visits.getById` has no owner filter | Critical | Any authenticated user can read any visit record |
| `visits.update` has no owner filter | Critical | Any authenticated user can update any visit record |
| `appointments.update` has no owner filter | Critical | Any authenticated user can update any appointment |
| No role-based access control | High | Receptionist can complete consultations, update clinic settings, delete patients |
| `visits` not scoped to `clinic_id` | High | In multi-doctor clinic, each doctor sees only their own visits — no shared clinic view |
| `appointments` not scoped to `clinic_id` | High | Same — multi-doctor clinics cannot share appointment calendars |
| Treatment plans created without `clinic_id` | High | Plans created via complete-consult are not visible via clinic scope |
| Anyone with join code can join clinic | Medium | No approval workflow — any user knowing the code becomes staff |

---

## PART 11 — ERROR HANDLING AUDIT

### 11.1 Global Error Handler

- **File:** `middleware/errorHandler.js`
- **What it catches:** Any error passed via `next(err)` that isn't caught by a route handler
- **Format:** `{ error: err.message || "Internal server error" }` with `err.status || 500`
- **What it misses:**
  - Does not differentiate between Supabase DB errors and application errors — a DB constraint violation returns the raw Supabase error message to the client
  - Does not sanitize error messages — internal table names, column names, and constraint names can leak via error responses
  - `console.error(err)` logs full stack trace — appropriate for dev, but in production this logs to stdout which may include PII in query errors

---

### 11.2 Per-Controller Error Handling

| Controller/Route | Uses try-catch? | Consistent error shape? | Notes |
|------------------|-----------------|------------------------|-------|
| auth.controller.js | Yes — all exports | Yes — passes to next(e) | OK |
| patients.controller.js | Yes — all exports | Yes — passes to next(e) | OK |
| visits.controller.js | Yes — all exports | Yes — passes to next(e) | OK |
| appointments.controller.js | Yes — all exports | Yes — passes to next(e) | OK |
| ai.controller.js (transcribe) | Yes | No — Sarvam errors return HTTP 200 with `warning` field | Inconsistent — not an error response |
| ai.controller.js (generateNote) | Yes — catches silently | No — falls back to mock data with HTTP 200 | Cannot detect failure |
| ai.controller.js (extractComplaint) | Yes — catches silently | No — falls back to raw transcript | Cannot detect failure |
| ai.controller.js (extractPatient) | Yes — catches silently | No — falls back to empty object | Cannot detect failure |
| ai.controller.js (extractPatientInfo) | Yes | Returns `warning` field with HTTP 200 | Partially signaled |
| ai.controller.js (extractPrescription) | Yes | Returns empty array with `warning` field and HTTP 200 | Partially signaled |
| routes/queue.routes.js | Yes — all handlers | Yes — passes to next(e) except queue PATCH (silent) | PATCH update has no error check |
| routes/payments.routes.js | Yes | Yes | OK |

---

### 11.3 Error Handling Issues

| Controller | Issue | Severity | Description |
|------------|-------|----------|-------------|
| ai.controller.js | All AI errors return HTTP 200 | High | Frontend cannot use HTTP status codes for error detection on any AI endpoint |
| ai.controller.js | Silent Gemini fallback | High | Mock data returned as real structured data — no indication of failure |
| visits.controller.js | Supabase error messages leaked | Medium | Raw Supabase errors (with table/column info) returned to client |
| queue.routes.js PATCH | No error check on queue_entries update | Medium | Silent success (200) even when update affects 0 rows due to clinicId mismatch |
| errorHandler.js | No PII sanitization | Medium | Patient data may appear in logged error messages |

---

## PART 12 — BACKGROUND JOBS

### 12.1 Audio Cleanup Job

- **File:** `jobs/cleanup.job.js`
- **How it's scheduled:** `setTimeout(fn, 30000)` at boot + `setInterval(fn, 86400000)` (24h) — both in `server.js`
- **Retention period:** 18 months (passed as parameter from server.js)
- **What it processes:** `visit_notes` rows where `audio_storage_path IS NOT NULL` AND `audio_uploaded_at < cutoff`
- **Process:** For each record (up to 100):
  1. `deleteFile('voice-notes', audio_storage_path)` — deletes from Supabase Storage
  2. `UPDATE visit_notes SET audio_storage_path = null WHERE id = ?` — nulls out the reference
- **Error handling:** Per-record try-catch — a failed delete is logged but doesn't stop the loop
- **Issues:**
  - **`voice_recordings` table is NOT cleaned up** — this table also stores audio_path references to voice-notes bucket, but the cleanup job only processes visit_notes. Old voice_recordings audio accumulates indefinitely.
  - **Batch size of 100** — if a backlog of 10,000 old recordings exists, it takes 100 days to clear them (one batch per day).
  - **`audio_uploaded_at` dependency** — if this column doesn't exist on `visit_notes`, the query returns 0 rows and the job does nothing silently.
  - **No cleanup for xrays bucket** — X-ray files are never deleted even if the patient is soft-deleted.

---

## PART 13 — PERFORMANCE & SCALABILITY ISSUES

### 13.1 N+1 Query Problems

| File | Endpoint | Description | Impact |
|------|----------|-------------|--------|
| routes/queue.routes.js:54 | `GET /action-queue` | Fetches checkout entries then fires one `prescriptions` COUNT query per entry | For 20 entries: 21 DB queries per request |
| routes/dataset.routes.js:53 | `GET /dataset/export` | Fetches records then generates one signed URL per record | For 500 records: 501 Storage API calls |
| routes/dataset.routes.js:117 | `GET /recordings/export` | Same N+1 for voice_recordings | For 500 records: 501 Storage API calls |

---

### 13.2 Missing Database Indexes

Based on `.eq()`, `.ilike()`, `.order()` patterns in controllers:

| Table | Column | Used In | Recommended Index |
|-------|--------|---------|------------------|
| patients | name | list (ILIKE `%q%`) | GIN trigram index for LIKE/ILIKE queries |
| patients | phone | list (ILIKE `%q%`) | GIN trigram or btree |
| patients | clinic_id | list (eq) | btree |
| patients | dentist_id | list (eq) | btree |
| visits | dentist_id | list, analytics (eq) | btree |
| visits | patient_id | list (eq) | btree |
| visits | visit_date | analytics (eq, lte, order) | btree |
| visits | follow_up_date | analytics (lte, not null) | btree |
| appointments | dentist_id | all appointment queries (eq) | btree |
| appointments | appointment_date | today, upcoming, bookedSlots (eq, gte, lte) | btree |
| queue_entries | clinic_id + queue_date | all queue queries (eq, eq) | composite btree |
| treatment_plans | patient_id + status | context (eq, eq) | composite btree |
| voice_recordings | dentist_id | dataset queries (eq) | btree |

---

### 13.3 Missing Pagination

| Endpoint | Returns All Rows? | Risk |
|----------|-----------------|------|
| `GET /api/patients` | Yes — no LIMIT | Critical — 5,000 patients × 20 visits each = massive response |
| `GET /api/visits` | Yes — no LIMIT | High — dentist with 3 years of records: 3,000+ rows |
| `GET /api/appointments` (no date) | Yes — no LIMIT | High |
| `GET /api/appointments/upcoming` | Yes (7-day window) | Low — bounded by date range |
| `GET /api/payments/patient/:id` | Yes — no LIMIT | Medium |
| `GET /api/queue` | Yes (today only) | Low — bounded by date |
| `GET /api/staff` | Yes | Low — small table |

---

### 13.4 Memory / CPU Issues

| Issue | File | Description | Severity |
|-------|------|-------------|----------|
| `fs.readFileSync` for audio | services/storage.service.js:6 | Entire 25 MB file loaded into Buffer before upload. 10 concurrent uploads = 250 MB RAM spike. Should use `fs.createReadStream`. | High |
| Large patient list with joins | controllers/patients.controller.js:24 | SELECT patients + all their visits + all their appointments — no LIMIT. 2,000 patients could return 50 MB JSON. | High |
| PDF generation in memory | services/pdf.service.js:16 | PDF generated entirely in-memory as a Buffer before being sent. Large prescriptions are fine (< 1 MB) but adds to per-request memory pressure. | Low |

---

## PART 14 — SECURITY AUDIT

### 14.1 Authentication Gaps

| Endpoint | Auth Required? | Actually Protected? | Gap |
|----------|---------------|-------------------|-----|
| `GET /health` | No | N/A | Fine |
| `POST /api/auth/send-otp` | No | N/A | Fine — public by design |
| `POST /api/auth/verify-otp` | No | N/A | Fine |
| `GET /api/visits/:id` | Yes | **No owner filter** | Any auth user reads any visit |
| `PUT /api/visits/:id` | Yes | **No owner filter** | Any auth user updates any visit |
| `PUT /api/appointments/:id` | Yes | **No owner filter** | Any auth user updates any appointment |
| `PATCH /api/clinic` | Yes | No role check | Receptionist can rename the clinic |
| `POST /api/queue/:id/complete-consult` | Yes | No role check | Receptionist can complete consultations |
| `GET /api/visit-notes/*` | Yes | No visitId ownership check | Any auth user reads/writes notes |
| All other endpoints | Yes | Scoped by dentist_id or clinic_id | Generally OK |

---

### 14.2 Input Validation

- **Validation library in use:** None (no joi, zod, express-validator)
- **Which endpoints validate input:**
  - `POST /api/auth/send-otp` — validates 10-digit phone regex
  - `POST /api/patients` — checks name + phone presence
  - `POST /api/treatment-plans` — checks patientId + procedureName presence
  - `POST /api/queue` — checks patientId presence
  - `POST /api/payments` — checks patientId + amount presence
  - `POST /api/queue/:id/complete-consult` — checks patientId + procedure presence
- **Endpoints that insert `req.body` directly into Supabase:**
  - `PUT /api/patients/:id` — `{ ...req.body, updated_at: ... }` — no field whitelist
  - `PUT /api/visits/:id` — `req.body` through partial field map then spread — extra fields pass through
  - `PUT /api/appointments/:id` — `{ ...req.body, updated_at: ... }` — no field whitelist
  - These allow callers to set any DB column on those rows, including `dentist_id`, `clinic_id`, `is_deleted`, etc.

---

### 14.3 Rate Limiting

- **Current config:** `{ windowMs: 15 * 60 * 1000, max: 100 }` — 100 requests per 15 minutes
- **Applied to:** All routes matching `/api/` prefix (global)
- **Per-IP vs global:** Per-IP (default express-rate-limit behavior)
- **Issues:**
  - 100 req/15 min is very permissive for the general API
  - AI endpoints that call external paid APIs (Gemini, Sarvam) have the same limit as read endpoints — no tighter restriction on cost-generating operations
  - OTP send endpoint shares this limit — brute force is partially mitigated (100 OTP requests per IP per 15 min max) but there's no per-phone-number rate limit

---

### 14.4 CORS

- **Current allowed origins:** `origin: true` (all origins)
- **This means:** Any website (`https://attacker.com`) can make authenticated cross-origin requests to this API
- **Actual risk in production:** If a user's JWT is obtained (e.g., from localStorage via XSS), any origin can use it. However, Capacitor apps don't use cookies, so CSRF is not applicable. The risk is moderate.

---

### 14.5 Data Leakage

- **Visits by UUID — no owner check:** `GET /visits/:id` returns any visit to any authenticated user.
- **Prescriptions GET /:id:** Returns patient PII (name, age, gender, phone) to any authenticated user who knows the UUID.
- **clinic.routes.js GET:** Returns `join_code` to any staff member — can be used to add unauthorized staff.
- **staff/me returns SELECT \***: Returns all staff columns — no field projection.
- **Supabase error messages:** Raw DB error messages returned to client (table names, constraint names visible).
- **Gemini API key in URL:** Key appears in every HTTP request URL — logged by reverse proxies, WAF, and Supabase edge.

---

## PART 15 — WHAT IS COMPLETELY MISSING

### 15.1 Missing Database Tables

Based on code references and system architecture:

| Table | Code References It? | Needed For | Complexity |
|-------|--------------------|-----------|-----------  |
| N/A — no fully missing tables found | — | All referenced tables appear to exist (though some columns may be missing) | — |

The 14 tables referenced in code all appear to exist. The gaps are at the column level (see 15.3).

---

### 15.2 Missing API Endpoints

| Endpoint | Needed For | Currently Missing |
|----------|-----------|-------------------|
| `DELETE /api/visits/:id` | Removing incorrect visit records | No delete endpoint exists |
| `DELETE /api/appointments/:id` | Cancelling without updating status | Only `PUT` for status change exists |
| `DELETE /api/treatment-plans/:id` | Removing plans | No delete endpoint |
| `GET /api/prescriptions` | Listing all prescriptions | No list endpoint (only POST + GET /:id) |
| `GET /api/payments` | Financial summary / report | No general payments list |
| `GET /api/queue/history` | Past queue entries | Only today's queue is accessible |
| `POST /api/auth/logout` | Token invalidation | No logout — tokens expire after 30 days only |
| `POST /api/auth/refresh` | Token renewal | No refresh mechanism |
| `PATCH /api/staff/:id` | Updating staff member details | No update endpoint |
| `DELETE /api/staff/:id` | Removing/deactivating staff | No deactivate endpoint |

---

### 15.3 Missing Schema Columns

| Table | Column | Frontend/Code References It As | Risk |
|-------|--------|-------------------------------|------|
| patients | `clinical_flags` | Queue context view — `patients(clinical_flags)` | If column missing: queue GET returns error |
| visits | `sitting_number` | treatment-plans GET /:id join | If missing: silently omitted from response |
| visits | `audio_uploaded_at` | cleanup.job.js cutoff filter | If missing: cleanup never deletes anything |
| appointments | `sitting_number` | treatment-plans GET /:id join | If missing: silently omitted |
| treatment_plans | `pending_amount` | queue.routes.js read + payments.routes.js write | If missing: all queue financial display breaks |
| prescriptions | `follow_up` | prescriptions GET /:id/pdf `rx.follow_up` | Missing — never inserted; PDF follow-up always blank |
| dentists | `clinic_name` | prescriptions GET /:id join | If column dropped: prescriptions /:id query errors |

---

### 15.4 Missing Integrations

| Integration | Status | Needed For |
|-------------|--------|-----------|
| SMS provider (MSG91, Twilio, AWS SNS) | **ABSENT** | OTP delivery — without this, OTP auth is non-functional in production |
| Supabase Realtime on `queue_entries` | Unknown (not configurable via backend code) | Real-time queue sync between doctor + receptionist screens |
| Supabase Realtime on `prescriptions` | Unknown | Receptionist notification when prescription is ready |
| Push notifications | Absent | Patient appointment reminders |
| Token refresh mechanism | Absent | Sessions expire after 30 days with no renewal path |

---

## PART 16 — BROKEN THINGS (What Fails Right Now)

| Endpoint | What Breaks | Why | Severity |
|----------|-------------|-----|----------|
| Any AI endpoint | Returns mock data, no real AI | `GEMINI_API_KEY` not in `.env.example`, likely missing on new deployments | Critical |
| `POST /api/auth/send-otp` | OTP generated but never delivered | No SMS provider integrated | Critical |
| `GET /api/treatment-plans/:id` | `sitting_number` missing from visits/appointments join results | Column likely does not exist | High |
| `GET /api/prescriptions/:id/pdf` | `follow_up` always blank in PDF | `follow_up` never saved to DB | High |
| `GET /api/queue` | May error if `clinical_flags` column missing from `patients` | Supabase returns column-not-found error on the join | High |
| `GET /api/payments/patient/:id` | `treatment_plans(procedure_name)` join | If `treatment_plan_id` is null on a payment, join is fine; but if `treatment_plans` table doesn't exist this fails | Medium |
| `PATCH /api/queue/:id` with no clinicId | Silently updates 0 rows, returns 200 with null entry | `.eq('clinic_id', undefined)` matches nothing | Medium |
| `DELETE /api/xrays/:id` followed by DB delete | Storage file deleted but DB record may persist if second call fails | Non-atomic two-step delete | Medium |
| `POST /api/visits/:visitId/notes` concurrent | Race condition on `note_number` | Non-atomic count+insert | Low |
| Cleanup job | May do nothing | `audio_uploaded_at` column may be missing from `visit_notes` | Medium |

---

## PART 17 — DEPENDENCY MAP

```
server.js
├── middleware/errorHandler.js
├── config/supabase.js (imported by all controllers and many routes)
│
├── routes/auth.routes.js
│   └── controllers/auth.controller.js
│       └── config/supabase.js
│
├── routes/patients.routes.js
│   ├── controllers/patients.controller.js → config/supabase.js
│   └── (inline handlers) → config/supabase.js
│
├── routes/visits.routes.js
│   └── controllers/visits.controller.js → config/supabase.js
│
├── routes/appointments.routes.js
│   └── controllers/appointments.controller.js → config/supabase.js
│
├── routes/ai.routes.js
│   └── controllers/ai.controller.js
│       ├── services/storage.service.js → config/supabase.js
│       ├── axios (Sarvam AI: api.sarvam.ai)
│       └── axios (Gemini: generativelanguage.googleapis.com)
│
├── routes/analytics.routes.js → config/supabase.js (inline)
│
├── routes/treatment-plans.routes.js → config/supabase.js (inline)
│
├── routes/visit-notes.routes.js → config/supabase.js (inline)
│
├── routes/prescriptions.routes.js
│   ├── config/supabase.js (inline)
│   ├── services/ai.service.js → axios (Gemini)
│   └── services/pdf.service.js → pdfkit
│
├── routes/xrays.routes.js
│   ├── config/supabase.js (inline)
│   └── services/storage.service.js
│
├── routes/dataset.routes.js
│   ├── config/supabase.js (inline)
│   └── services/storage.service.js
│
├── routes/queue.routes.js
│   ├── config/supabase.js (inline)
│   └── services/ai.service.js → axios (Gemini)
│
├── routes/staff.routes.js → config/supabase.js (inline)
├── routes/clinic.routes.js → config/supabase.js (inline)
│
├── routes/payments.routes.js → config/supabase.js (inline)
│
└── jobs/cleanup.job.js
    ├── config/supabase.js
    └── services/storage.service.js
```

**External dependencies:**
- **Supabase** (Database + Storage) — all data operations
- **Google Gemini API** — 6 endpoints across ai.controller + ai.service
- **Sarvam AI** — 1 endpoint (speech-to-text)
- **No SMS provider** — required but absent

---

## PART 18 — SUMMARY SCORECARD

| Dimension | Score (1-10) | Notes |
|-----------|-------------|-------|
| Auth & Security | 5/10 | JWT auth is functional; OTP system has no SMS delivery; 3 endpoints have no owner filter (data leakage); CORS allows all origins; no RBAC enforcement |
| API Completeness | 6/10 | Core CRUD is present for all entities; missing list endpoints for prescriptions/payments; no logout/refresh; no delete for visits/appointments/plans |
| Database Design | 6/10 | Schema is mostly sound; `pending_amount` denormalization can drift; `sitting_number` referenced but likely missing; no clear migration files |
| Error Handling | 4/10 | All AI endpoints return HTTP 200 on failure; silent Gemini fallback returns fake data; queue PATCH has silent zero-row update; raw DB errors leak to client |
| AI Integration | 6/10 | Sarvam and Gemini integration is functional with fallbacks; two incompatible prescription schemas; API key in URL; GEMINI_API_KEY missing from .env.example |
| Storage Implementation | 5/10 | Upload/download/delete works; `readFileSync` is a memory risk; no file type validation; content-type is hardcoded incorrectly; `deleteFile` swallows errors |
| Scalability | 3/10 | Multiple unbounded list endpoints (no pagination); N+1 in action-queue and dataset exports; no DB indexes noted; `readFileSync` for large files |
| Code Quality | 6/10 | Consistent patterns, good error propagation via `next(e)`; inline route handlers mixed with controllers; no tests; route files contain business logic that should be in controllers |
| Test Coverage | 0/10 | No test files found anywhere in the codebase |
| Documentation | 2/10 | No README, no API docs, no swagger, no JSDoc — this audit is the first documentation |
| **Overall** | **4.3/10** | Functional for solo-dev demo use; significant gaps before production multi-staff deployment |

---

## PART 19 — PRIORITISED ISSUES LIST

### CRITICAL (will crash or expose data)

1. **[CRITICAL-001]** — `controllers/auth.controller.js:47` — **No SMS provider**: OTP is generated and stored but never sent. Authentication is non-functional in production for real phone numbers.

2. **[CRITICAL-002]** — `controllers/visits.controller.js:38` — **No owner filter on `GET /visits/:id`**: Any authenticated user can read any visit record by UUID. Full patient data leakage.

3. **[CRITICAL-003]** — `controllers/visits.controller.js:47` — **No owner filter on `PUT /visits/:id`**: Any authenticated user can overwrite any visit record.

4. **[CRITICAL-004]** — `controllers/appointments.controller.js:68` — **No owner filter on `PUT /appointments/:id`**: Any authenticated user can overwrite any appointment.

5. **[CRITICAL-005]** — `.env.example` — **`GEMINI_API_KEY` missing**: All AI endpoints return hardcoded mock data on every deployment that follows `.env.example`. Silent failure with fake data.

---

### HIGH (breaks core functionality)

6. **[HIGH-001]** — `routes/queue.routes.js:303` — **`clinical_flags` column in queue SELECT join**: If this column doesn't exist on `patients` table, `GET /api/queue` returns an error for all clinic users — the entire queue is broken.

7. **[HIGH-002]** — `routes/treatment-plans.routes.js:34` — **`sitting_number` referenced in visits/appointments join**: If column is missing, treatment plan detail view silently returns incomplete data; if column triggers a Supabase error, the whole endpoint fails.

8. **[HIGH-003]** — `routes/prescriptions.routes.js:75` — **`rx.follow_up` never exists in DB**: PDF prescriptions always show blank follow-up regardless of what the doctor dictated.

9. **[HIGH-004]** — `controllers/patients.controller.js:41` — **`clinical_flags` not saved on patient create**: The field is accepted in the request body, silently dropped on insert. Patient medical flags set at registration are lost.

10. **[HIGH-005]** — `services/storage.service.js:6` — **`fs.readFileSync` on upload**: Entire audio/image file loaded into memory. Under load this will cause OOM crashes.

11. **[HIGH-006]** — `routes/queue.routes.js:54` — **N+1 query in `/action-queue`**: One SELECT per queue entry — 20 entries = 21 queries on a single endpoint call.

12. **[HIGH-007]** — `controllers/patients.controller.js:63` — **`PUT /patients/:id` spreads `req.body` directly**: Caller can overwrite `dentist_id`, `clinic_id`, `is_deleted`, or any other DB column.

13. **[HIGH-008]** — `controllers/appointments.controller.js:70` — **`PUT /appointments/:id` spreads `req.body` directly**: Same issue.

---

### MEDIUM (degrades experience or performance)

14. **[MEDIUM-001]** — `controllers/patients.controller.js:24` — **No pagination on `GET /patients`**: Returns all patients + all visits + all appointments in one response. Will cause timeouts for large clinics.

15. **[MEDIUM-002]** — `controllers/visits.controller.js:3` — **No pagination on `GET /visits`**: Returns all visits ever for a dentist.

16. **[MEDIUM-003]** — `routes/queue.routes.js:128` — **PATCH queue with undefined clinicId silently does nothing**: Returns HTTP 200 with null entry. No error signal.

17. **[MEDIUM-004]** — `routes/payments.routes.js:27` — **Non-atomic payment + treatment plan balance update**: Race condition under concurrent payments for the same plan.

18. **[MEDIUM-005]** — `routes/queue.routes.js:219` — **`complete-consult` not atomic**: Treatment plan created but queue entry update (step 4) can fail silently — orphaned plan.

19. **[MEDIUM-006]** — `routes/queue.routes.js:237` — **`complete-consult` appointments hardcoded to `10:00`**: Auto-generated appointments are always scheduled at 10 AM regardless of clinic hours.

20. **[MEDIUM-007]** — `routes/visit-notes.routes.js:30` — **Race condition on `note_number`**: Two concurrent note creates get the same `note_number`.

21. **[MEDIUM-008]** — `routes/clinic.routes.js:17` — **No role check on `PATCH /api/clinic`**: Receptionist can change clinic name, address, hours.

22. **[MEDIUM-009]** — `controllers/ai.controller.js` — **All AI errors return HTTP 200**: Makes it impossible to detect failures via standard HTTP error handling.

23. **[MEDIUM-010]** — `jobs/cleanup.job.js:10` — **`voice_recordings` audio not cleaned up**: Only `visit_notes` audio is purged — `voice_recordings.audio_path` references accumulate indefinitely.

24. **[MEDIUM-011]** — `routes/patients.routes.js:11` — **tooth-history and case-sheet sub-routes scoped by `dentist_id` not `clinic_id`**: Multi-doctor clinics show incomplete patient history.

25. **[MEDIUM-012]** — `routes/xrays.routes.js:62` — **Non-atomic xray delete**: Storage file deleted first; if DB delete fails, record points to missing file.

---

### LOW (technical debt, best practices)

26. **[LOW-001]** — `server.js:13` — **CORS `origin: true` in production**: All origins allowed. Should be restricted to known app origins.

27. **[LOW-002]** — `controllers/auth.controller.js:226` — **`GET /me` has a write side-effect**: Generates join_code on a GET request.

28. **[LOW-003]** — `middleware/auth.js:19` — **DB query on every request for old tokens**: Extra latency per request until old tokens expire.

29. **[LOW-004]** — `.env.example` — **`ANTHROPIC_API_KEY` and `USE_DEV_OTP` are misleading dead variables**: Neither is used by the code.

30. **[LOW-005]** — Multiple routes — **No input validation library**: All validation is ad-hoc `if (!field)` checks. Malformed data (wrong types, oversized strings) reaches the DB.

31. **[LOW-006]** — `controllers/ai.controller.js:150` — **Gemini API key in URL query parameter**: Key visible in server access logs and reverse proxy logs.

32. **[LOW-007]** — `routes/clinic.routes.js:12` — **`GET /clinic` returns `join_code`**: All staff can see the code and share it externally.

33. **[LOW-008]** — `routes/appointments.controller.js:42` — **`bookedSlots` missing date guard**: If no `date` param, returns all times for all non-cancelled appointments.

34. **[LOW-009]** — `routes/prescriptions.routes.js:89` — **Legacy `dentists` join on `GET /prescriptions/:id`**: References `dentists.clinic_name` — old legacy table field. Should join `staff` and `clinics` instead.

35. **[LOW-010]** — `controllers/auth.controller.js:238` — **`PUT /auth/profile` overwrites phone without re-verification**: Phone number can be changed without OTP confirmation.

---

## PART 20 — RECOMMENDED NEXT STEPS

### Immediate Fixes (do before any new feature work)

1. **Fix the 3 unscoped visit/appointment endpoints** — Add `eq('dentist_id', req.dentistId)` (or `clinic_id` where appropriate) to `GET /visits/:id`, `PUT /visits/:id`, and `PUT /appointments/:id`. This is a critical data leakage fix.

2. **Add `GEMINI_API_KEY` to `.env.example`** — One line. Without it every new deployment silently uses mock AI data.

3. **Fix `clinical_flags` on patient create** — Add `clinical_flags` to the `patients.create` INSERT. One line change. Currently silently dropped.

4. **Fix `pending_amount` on `PATCH /treatment-plans/:id`** — Recalculate `pending_amount` whenever `estimatedCost` or `collectedAmount` is updated, just as `payments.routes.js` does.

5. **Switch `fs.readFileSync` to `fs.createReadStream`** in `services/storage.service.js`. The Supabase JS client accepts streams. This removes the memory spike for large audio uploads.

---

### Schema Extensions Needed (SQL migrations)

In dependency order:

```sql
-- 1. Confirm clinical_flags exists on patients (add if missing)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_flags JSONB;

-- 2. Confirm sitting_number on visits (add if missing)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS sitting_number INTEGER;

-- 3. Confirm sitting_number on appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sitting_number INTEGER;

-- 4. Confirm audio_uploaded_at on visit_notes (cleanup job depends on this)
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS audio_uploaded_at TIMESTAMPTZ;

-- 5. Add follow_up column to prescriptions so it can be saved + displayed in PDF
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up TEXT;

-- 6. Add clinic_id to visits (for multi-doctor clinic scoping)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- 7. Add clinic_id to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- 8. Add clinic_id to prescriptions (if not exists)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_dentist_id ON patients(dentist_id);
CREATE INDEX IF NOT EXISTS idx_visits_dentist_id ON visits(dentist_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_visit_date ON visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_appointments_dentist_id ON appointments(dentist_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_date ON queue_entries(clinic_id, queue_date);
```

---

### New Endpoints Needed

1. `POST /api/auth/logout` — Invalidate token (requires token denylist or short expiry)
2. `GET /api/prescriptions` — List prescriptions (filtered by patientId, date range)
3. `DELETE /api/visits/:id` — Soft delete
4. `DELETE /api/treatment-plans/:id` — Soft delete / cancel
5. `PATCH /api/staff/:id` — Update staff (role, name, status)
6. `DELETE /api/staff/:id` — Deactivate staff member
7. `GET /api/payments` — Paginated payments list for a clinic with date filter
8. `GET /api/queue/history` — Past queue entries (by date range)
9. `GET /api/visits/:visitId/notes/:noteId` — Get a single note
10. `DELETE /api/visit-notes/:id` — Delete a note

---

### Architecture Decisions to Make

1. **SMS Provider** — Must choose and integrate before production. MSG91 is common for India; Twilio is international. This is a blocker for real user auth.

2. **Token refresh strategy** — Currently tokens are valid 30 days with no refresh. Options: (a) short-lived tokens + refresh tokens, (b) sliding expiry on each request, (c) keep 30-day tokens but add a denylist for logout.

3. **Multi-doctor visit scoping** — Decide if visits/appointments should be scoped per-doctor or per-clinic. Currently it's per-doctor (dentist_id), which means doctors in the same clinic cannot see each other's patients' history. This is a design decision that affects migrations.

4. **`pending_amount` denormalization** — Either make it a computed/generated column in Postgres (always consistent) or ensure ALL code paths that change `estimated_cost` or `collected_amount` also update `pending_amount`. Currently `PATCH /treatment-plans/:id` does not.

5. **AI error signaling** — Decide on a convention: option A: return HTTP 4xx/5xx on AI failures; option B: return `{ data: ..., aiStatus: "success"|"fallback"|"error" }` envelope. The current silent fallback is the worst option.

6. **Supabase Realtime** — Enable on `queue_entries` via Supabase Dashboard (cannot be done from Node.js backend). This is required for the receptionist ↔ doctor live queue sync to work.

---

### What NOT to Touch (Working Well)

1. **`middleware/auth.js`** — The V3 auth + backward-compat fallback logic is well-structured. Leave the core JWT verification alone.
2. **`jobs/cleanup.job.js`** — The cleanup logic is correct. Only needs extension for `voice_recordings` table.
3. **`services/pdf.service.js`** — PDF generation is solid. The `deriveSlots` fallback is a nice touch.
4. **`routes/auth.routes.js` + `controllers/auth.controller.js`** — The multi-clinic onboarding flow (create → lookup → join) is well designed.
5. **`routes/queue.routes.js` reorder logic** — The `sort_order` swap approach is sensible.
6. **`middleware/errorHandler.js`** — Simple and correct. Don't overcomplicate it.
7. **AI prompt quality** — The system prompts for Gemini are detailed, multilingual, and contextually appropriate for Indian dental practice. They should not be simplified.

---

*End of Audit — backend/BACKEND_AUDIT.md*
*This document was generated by reading source code only. No changes were made to any file.*
