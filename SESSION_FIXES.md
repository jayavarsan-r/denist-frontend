# Session Fixes — DentAI Local Setup & Bug Fixes

_Date: 2026-06-05_

This document records the issues diagnosed and fixed while getting the DentAI
app running locally, plus one outstanding item.

---

## 0. Local run setup

- **Frontend** (`dentai-app/`): Next.js 16.2.7 (Turbopack) — `npm run dev` → http://localhost:3000
- **Backend** (`backend/`): Express — `PORT=4000 npm start` → http://localhost:4000
  (default port 3000 collides with the frontend, so the backend runs on **4000**)
- The frontend talks to the backend via `NEXT_PUBLIC_API_URL` in `dentai-app/.env.local`.

**Local dev login** (no real SMS — OTP is pinned in `backend/.env`):
- Phone: `1234567891`
- OTP: `123456`

> Note: the local backend uses the **real shared Supabase DB**, so these fixes
> repair actual data and your existing patients/clinics are present.

---

## 1. "Failed to send OTP"

**Symptom:** Login showed _"Failed to send OTP. Try again."_

**Root cause:** `NEXT_PUBLIC_API_URL` ended in `/api`, but every service path
already starts with `/api/...` (e.g. `apiClient.post('/api/auth/send-otp')`).
Axios concatenated them → `/api/api/auth/send-otp` → **404**.

**Evidence:**
- `POST .../api/api/auth/send-otp` → `HTTP 404`
- `POST .../api/auth/send-otp` → `{"success":true,"message":"OTP sent"}` `HTTP 200`

**Fix:** removed the trailing `/api` from `dentai-app/.env.local`.
(Base URL must NOT include `/api`; the code adds it.)

---

## 2. Voice auto-fill ("Speak patient details") filled nothing

**Symptom:** Dictating patient details didn't populate any field, with no error.

**Root cause (two layers):**
1. The frontend pointed at a **stale backend deployment** (`dentist-app-aco0.onrender.com`)
   that was missing the `/api/ai/extract-patient-info` route → **404**.
   Transcription worked (that route existed) but extraction 404'd.
2. `components/sheets/CheckInSheet.jsx` **silently swallows** extraction errors
   (`catch { /* keep typed */ }`), so the 404 produced no visible error and no fill.

**Evidence (deployed backends had drifted):**

| Route                  | dentist-app-aco0 | denist-frontend | local `backend/` |
|------------------------|:----------------:|:---------------:|:----------------:|
| `transcribe`           | ✅ (401)         | ✅ (401)        | ✅               |
| `extract-patient-info` | ❌ (404)         | ✅ (401)        | ✅               |
| `extract-queue-context`| ❌ (404)         | ❌ (404)        | ✅               |

**Fix:** pointed the frontend at the **local backend** (`http://localhost:4000`),
which has every route. Verified end-to-end — a sample transcript returned:

```json
{ "name": "Priya", "age": 28, "phone": "9443873713",
  "chiefComplaint": "Tooth pain", "flags": { "hasDiabetes": true } }
```

**Recommended follow-up (not yet done):** surface a real error message in
`CheckInSheet.jsx` instead of silently swallowing extraction failures.

---

## 3. "Could not create clinic" — HTTP 500

**Symptom:** `POST /api/auth/create-clinic` → 500 on every attempt.

**Root cause:** Postgres FK violation
`staff_dentist_id_fkey` (pgcode `23503`). The JWT's `dentistId` was not a real
`dentists.id`. Two contributing bugs:
- `auth.controller.js` (verify-otp) used `dentistId: staffRow.dentist_id || staffRow.id`
  — when a staff row's `dentist_id` was NULL, the token got the **staff** id as the
  `dentistId`.
- `create-clinic` then inserted a `staff` row with `dentist_id = <that staff id>`,
  which isn't a real dentist → FK violation.

Additionally, the browser was holding a **stale / cross-backend token** (issued by
the old `dentist-app-aco0` backend) whose `dentistId` was poisoned.

**Fix (two parts):**
1. **Login self-heal** — on `verify-otp`, if a returning staff row has a NULL/dangling
   `dentist_id`, resolve a real dentist (reuse by phone, else create) and persist the
   link, instead of the broken `|| staffRow.id` fallback.
2. **`create-clinic` heal** — added `ensureDentistId(req)` helper that guarantees a
   real `dentists.id` right before the staff insert, and returns a **fresh corrected
   token** so the client session self-repairs (no manual re-login needed).

---

## 4. "Failed to join clinic" — HTTP 500

**Symptom:** Joining a clinic as Receptionist → 500.

**Root cause:** Identical to #3 — `join-clinic` also inserts a `staff` row with
`dentist_id = req.dentistId`, hitting the same `staff_dentist_id_fkey` violation
with the still-poisoned token.

**Fix:** applied the same `ensureDentistId(req)` heal to `joinClinic`, and refactored
the heal logic out of `createClinic` into the shared helper at the top of
`backend/src/controllers/auth.controller.js`.

> Product note: joining the same clinic you created, with the same account, can't make
> you both doctor and receptionist (`unique(clinic_id, dentist_id)`). The backend now
> handles this gracefully (returns existing membership). A real receptionist join uses
> a **different phone** + the clinic join code.

---

## 5. Patient profile "Cases" tab crash — `plans.map is not a function`

**Symptom:** Opening a patient → **Cases** tab threw a runtime `TypeError:
plans.map is not a function` at `app/patients/[id]/PatientProfileClient.jsx:187`.

**Root cause:** Response-shape mismatch. The backend's treatment-plans endpoint
returns `{ plans: [...] }` (`backend/src/routes/patients.routes.js:116`), but the
frontend read `data?.treatment_plans || data?.treatmentPlans || data` — neither key
matched, so it fell through to `data` itself (the whole `{ plans: [...] }` **object**).
`plans` was then an object: `plans.length` was `undefined` (so the empty-state guard
was skipped) and `plans.map` blew up.

**Fix:** in `CasesTab`, read the correct `plans` key and **always coerce to an array**
(tolerating `treatment_plans` / `treatmentPlans` / a bare array too). Also defensively
hardened the sibling xrays loader (line 514) which shared the identical one-line
`... || data || []` crash vector (not currently broken — its keys matched).

---

## 6. Outstanding — "already logged in account" flash on `/`

**Status:** Diagnosed, **not yet fixed** (awaiting go-ahead).

**Cause:** The home screen renders unconditionally; `components/FlowGuard.jsx` gates
auth inside a `useEffect` (runs **after** first paint) and fires an async `getMe()`.
Sequence: home paints → `getMe` hydrates your account onto it → FlowGuard redirects
you away (to `/login`, `/roles`, or `/doctor/setup`). That hydrate-then-redirect
window is the flash.

**Proposed fix:** block protected content from rendering until FlowGuard resolves
auth+flow state (show a splash/loader while `!started && getToken()` is pending);
keep `/login` and `/onboarding` rendering immediately since they're public.

---

## Files changed

| File | Change |
|------|--------|
| `dentai-app/.env.local` | Base URL → `http://localhost:4000` (no trailing `/api`) |
| `backend/src/controllers/auth.controller.js` | Added `ensureDentistId()` helper; login self-heal in `verifyOtp`; heal in `createClinic` and `joinClinic` |
| `dentai-app/app/patients/[id]/PatientProfileClient.jsx` | Coerce treatment-plans (and xrays) API responses to arrays — fixes `plans.map is not a function` |

## Still recommended (not done)
- Surface extraction errors in `CheckInSheet.jsx` (stop swallowing them).
- Fix the login flash (#6).
- Strip a trailing `/api` defensively in `lib/api/client.js` so the base-URL gotcha
  can't recur.
