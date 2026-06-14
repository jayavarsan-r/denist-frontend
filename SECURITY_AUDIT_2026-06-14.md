# DentAI Platform — Security, Reliability & Production-Readiness Audit
**Date:** 2026-06-14 · **Scope:** entire monorepo (`backend/`, `dentai-app/`) · **Posture assumed:** real patient PHI

> Methodology note: every finding below is grounded in code that was read directly (file:line cited). Items that require checking the *live* Supabase/Render configuration (which cannot be read from the repo) are explicitly marked **VERIFY LIVE**.

---

## 1. Executive Summary

DentAI is a multi-tenant dental-clinic platform: a Node/Express API (Supabase Postgres + Storage, JWT auth, pg-boss queue, WebSockets) and a Next.js 16 / React 19 client wrapped with Capacitor for iOS/Android. AI extraction runs on Google Gemini; speech-to-text on Sarvam.

**The good news:** the application-layer authorization is genuinely well-built. Tenant isolation by `clinic_id` is applied *consistently* across the API (repository `_scope`, `patientInScope()`, `requireClinicOwnership`, per-handler `req.clinicId` guards). Queries are parameterized through supabase-js, inputs are validated with Zod (with mass-assignment protection), `helmet` is enabled, webhooks use HMAC + `timingSafeEqual`, and several workflows have idempotency gates. The IDOR surface inside the API is small — I verified patients, payments, prescriptions, treatment-plans, staff, notifications, x-rays, and consultation-drafts and found them correctly scoped.

**The bad news:** that careful app-layer work sits on top of infrastructure and compliance gaps that are disqualifying for real PHI:

1. **No database Row-Level Security**, while the backend holds the **service-role key** and the client is wired to receive the **anon key** — a single config step from full PHI exposure.
2. **PHI is sent to third-party AI (Gemini/Sarvam) with no BAA** — a direct HIPAA violation.
3. **OTP codes are stored in plaintext** and a **dev-OTP bypass** (`USE_DEV_OTP=true`, `DEV_OTP=123456`) lives in the codebase.
4. **30-day JWTs in `localStorage` with no revocation**, **debug code copying every patient's audio to `/tmp`**, **PHI written to logs**, **`Math.random()` clinic join-codes that auto-grant doctor access**, and **no audit logging of PHI access or logins**.

**Verdict: NOT production-ready for real patient data.** The criticals are fixable in roughly 2–4 focused weeks; none require re-architecture.

**Production-Readiness Scorecard**

| Dimension | Score | One-line rationale |
|---|---:|---|
| Security | **38 / 100** | Strong app-layer authz undermined by RLS-off + service/anon key exposure, plaintext OTP, dev-OTP landmine, localStorage tokens |
| Reliability | **45 / 100** | Good graceful degradation, but no DB transactions, payment race, single instance, no documented backup/DR |
| Scalability | **40 / 100** | Fine at small scale; unbounded list queries, in-memory rate limiter, in-process workers, free-tier AI ceiling block scale-out |
| Compliance (HIPAA/GDPR) | **20 / 100** | PHI to non-BAA AI, no access/login audit, plaintext OTP, PHI in logs/temp, no consent/retention/DSAR |
| **Overall** | **32 / 100** | Promising product; must remediate criticals before touching real PHI |

---

## 2. Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
   iOS / Android (Capacitor)        Web (Next.js static export)
   com.dentway.app · https      │   NEXT_PUBLIC_API_URL                  │
        │                        │                                       │
        │  Bearer JWT (localStorage, 30d)        Supabase anon key ──────┼──► Supabase Realtime
        ▼                        │   (NEXT_PUBLIC_SUPABASE_ANON_KEY)      │     (postgres_changes:
   ┌──────────────────────────────────────────────┐                     │      queue/appts/drafts)
   │   Express API  (Render web service, 1 inst)   │                     │
   │   helmet · cors(origin:true) · rate-limit(mem)│                     │
   │   JWT verify ─► req.{dentistId,staffId,        │                    │
   │                 clinicId,role}                 │                    │
   │   routes ─► controllers ─► repositories ──────┼──► Supabase Postgres (SERVICE-ROLE key, RLS OFF)
   │                          └─► transaction.svc   │    tables: patients, visits, prescriptions,
   │   pg-boss workers (in-process):                │            xrays, payments, otp_codes, audit_logs…
   │     voice · whatsapp-in/out · reminders · eod  │
   └───────┬───────────────┬──────────────┬────────┘
           │               │              │
           ▼               ▼              ▼
   Supabase Storage   Google Gemini   Sarvam STT      MSG91/Meta/AiSensy
   (xrays, voice-     (generative-    (audio→text)    (OTP SMS · WhatsApp)
    notes, logos)      language API)
   ── PHI leaves the trust boundary to Gemini + Sarvam (no BAA) ──
```

**Stack inventory (discovered, not assumed)**
- **Backend:** Express 4, `@supabase/supabase-js` 2, `jsonwebtoken` 9, `express-rate-limit` 7, `helmet` 7, `multer`, `pg-boss` 10, `ws` 8, `zod` 4, `pdfkit`, `axios`, `morgan`.
- **Frontend:** Next 16.2.7, React 19, `@supabase/supabase-js`, `zustand`, `axios`, Capacitor 8 (camera/filesystem/share/file-opener).
- **Data:** Supabase Postgres + Storage. **Queue:** pg-boss (in-process). **AI:** Gemini `gemini-2.5-flash-lite`, Sarvam STT. **Messaging:** MSG91 (OTP SMS), Meta Cloud / AiSensy (WhatsApp). **Deploy:** Render (`render.yaml`). No payment provider. No Docker/K8s.

---

## 3. Data-Flow & Auth-Flow Diagrams

**Authentication (OTP, phone-based, no passwords)**
```
POST /api/auth/send-otp {phone}
  → 6-digit code (Math.random) OR pinned DEV_OTP=123456 if USE_DEV_OTP
  → stored PLAINTEXT in otp_codes (10-min expiry)  → SMS via MSG91 (unless pinned)
POST /api/auth/verify-otp {phone, otp}
  → match plaintext row (no attempt counter) → mint JWT (HS256, expiresIn 30d)
  → JWT carries {dentistId, staffId, clinicId, role}
  → client stores in localStorage('dentai_token'); axios sends Bearer on every call
auth middleware: jwt.verify → req.{dentistId,staffId,clinicId,role}
  (V3 token path trusts clinic context from JWT; never re-checks staff.status)
```

**PHI write/read path**
```
Voice consult → /api/ai/transcribe → Sarvam STT (PHI audio leaves)
            → audio copied to /tmp/last_audio_upload (DEBUG) + uploaded to Storage
            → transcript (PHI) logged (preview) + stored in voice_recordings
extraction → /api/ai/extract-* → Gemini (PHI transcript leaves, no BAA)
doctor confirms draft → transaction.confirmConsultationDraft (NON-ATOMIC multi-table write)
            → treatment_plans + visits + prescriptions + appointments + lab_cases
read → /api/patients/:id/* → clinic-scoped queries → JSON / PDF (case-sheet, statement)
```

---

## 4. Vulnerability Table

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **CRITICAL** | No RLS on any table + backend uses service-role key + client wired to ship anon key → potential full PHI read/write bypass via PostgREST | `config/supabase.js:6`, `supabase_schema.sql` (no policies), `dentai-app/lib/realtime.js:23` |
| 2 | **CRITICAL** | PHI (names, age, conditions, allergies, complaints, transcripts) sent to Google Gemini & Sarvam with no BAA; free-tier may train on data | `services/ai/providers/gemini.provider.js:96`, `controllers/ai.controller.js:36,149` |
| 3 | **CRITICAL** | OTP stored plaintext + `USE_DEV_OTP=true`/`DEV_OTP=123456` bypass in code (any phone → 123456) | `controllers/auth.controller.js:46-55`, `backend/.env` |
| 4 | **HIGH** | 30-day JWT, no revocation/refresh; stored in `localStorage` (XSS-stealable); deactivated staff keep access (V3 path skips status re-check) | `auth.controller.js:9`, `middleware/auth.js:12-17`, `lib/api/client.js:8-13` |
| 5 | **HIGH** | Debug code copies every patient's audio to fixed `/tmp/last_audio_upload`; transcript PHI written to logs | `controllers/ai.controller.js:35,42` |
| 6 | **HIGH** | Clinic join-code = `Math.random()` 6 chars, grants auto-**doctor** (full PHI) on join, no approval; lookup endpoint enables validation; codes never expire | `routes/clinic.routes.js:13-18`, `auth.controller.js:181-209` |
| 7 | **HIGH** | No audit logging of PHI **access** (reads), logins, or patient create/update/delete; audit table has no IP/user-agent | `services/audit.service.js`, `migrations/005_audit_logs.sql` |
| 8 | **HIGH** | No DB transactions: multi-table clinical writes are "best-effort sequenced" → partial records; payment balance race (read-modify-write) → financial drift | `services/transaction.service.js:1-5,324-340` |
| 9 | **MEDIUM** | `cors({ origin: true })` reflects any origin on a PHI API | `server.js:30` |
| 10 | **MEDIUM** | OTP brute-force: 6-digit, 10-min, no per-phone lockout, only coarse per-IP rate limit; user enumeration via verify-otp response shape | `auth.controller.js:79-85,130,149` |
| 11 | **MEDIUM** | File upload: extension-only content-type (no magic bytes), no fileFilter; x-ray upload doesn't verify `patientId` ∈ clinic; storage key built from unvalidated `patientId` (path manipulation) | `services/storage.service.js:30-49`, `routes/xrays.routes.js:18` |
| 12 | **MEDIUM** | PostgREST filter injection via `.or()` string interpolation of user input | `controllers/patients.controller.js:22`, `workers/whatsapp-inbound.worker.js:218` |
| 13 | **MEDIUM** | No security headers / CSP on the Next.js web app | `dentai-app/next.config.js` |
| 14 | **MEDIUM** | Phone number change without OTP re-verification (identity = phone) | `auth.controller.js:238-239` |
| 15 | **MEDIUM** | WhatsApp webhook skips signature verification when `WHATSAPP_PROVIDER=stub` (default); empty-secret fallback | `routes/whatsapp.webhook.routes.js:25-28` |
| 16 | **MEDIUM** | 24h signed URLs minted for PHI audio in dataset export | `routes/dataset.routes.js:66,130` |
| 17 | **MEDIUM** | Double-booking TOCTOU (check-then-insert); queue check-in race; no DB uniqueness constraints to enforce | `controllers/appointments.controller.js:64-70`, `routes/queue.routes.js:115` |
| 18 | **MEDIUM** | Real secrets in plaintext `backend/.env` on disk (service-role key, JWT secret, 3 Gemini keys, Sarvam, DB URL); no secret manager | `backend/.env` |
| 19 | **LOW** | Frontend: 2 moderate npm advisories (postcss XSS via Next build tooling) | `dentai-app` npm audit |
| 20 | **LOW** | Clinic owner not protected — any doctor can deactivate the owner | `routes/staff.routes.js:54-63` |
| 21 | **LOW** | `.env.production` (frontend) → `http://localhost:4000` (cleartext + wrong target) | `dentai-app/.env.production` |
| 22 | **LOW** | Error `details` (incl. up to 2000 chars of raw AI output) returned/logged on some non-500s | `middleware/errorHandler.js:9,31`, `gemini.provider.js:57` |
| 23 | **LOW** | PHI columns stored without column-level encryption (relies solely on Supabase at-rest disk encryption) | `supabase_schema.sql` |
| 24 | **LOW** | Audit metadata embeds transcript slices (PHI) despite "never PHI" intent | `controllers/ai.controller.js:114` |

---

## 5. Security Findings (detail for Critical & High)

### CRITICAL-1 — RLS disabled + service key + client anon-key path  **(VERIFY LIVE)**
- `config/supabase.js:6` instantiates the client with `SUPABASE_SERVICE_KEY` → **every backend query bypasses RLS**. That is acceptable *only if* RLS is the safety net for any other key. It is not: a repo-wide grep for `enable row level security` / `create policy` across `supabase_schema.sql`, `SUPABASE_MIGRATIONS.sql`, and all `migrations/*.sql` returns **nothing**. RLS is not defined anywhere.
- `dentai-app/lib/realtime.js:22-33` is built to create a browser Supabase client from `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `NEXT_PUBLIC_*` values are embedded in the shipped bundle by design.
- **Consequence:** Supabase grants the `anon`/`authenticated` roles table access by default; RLS is the gate. With RLS off, anyone holding the anon key can call `GET https://<project>.supabase.co/rest/v1/patients?select=*` and read/modify **all PHI across all clinics**, bypassing every app-layer `clinic_id` check. The realtime `filter: clinic_id=eq.X` is client-supplied and is **not** a security boundary.
- **Current state:** `dentai-app/.env.local` sets only the URL, so realtime is presently disabled (the key guard returns null). The exposure becomes live the moment the anon key is provisioned to any client build — which the feature requires. The backend `.env` already contains the anon key (a 208-char JWT).
- **Fix:** Enable RLS on every table and write `clinic_id`-based policies, even though the backend uses the service key (defense in depth). Treat the anon key as public. Verify in the Supabase dashboard that RLS is ON for all `public` tables before any client ships the anon key. See remediation §10.

### CRITICAL-2 — PHI to third-party AI without a BAA (HIPAA)
- `gemini.provider.js:96` POSTs user content to `generativelanguage.googleapis.com`. The content includes consultation transcripts and patient registration data assembled in `ai.controller.js` (`extractPatient`, `extractQueueContext`, `extractPrescription`) — i.e. **names, ages, blood group, diabetes/pregnancy/heart flags, allergies, chief complaints**. `transcribeAudio` sends raw patient **audio** to Sarvam.
- HIPAA requires a Business Associate Agreement with any vendor processing PHI. Google's **free-tier** Gemini API (the keys in `.env` are `AIza…` free-tier keys, and the code round-robins three of them to dodge per-minute caps) explicitly offers **no BAA** and may use submitted data to improve products. Same concern for Sarvam.
- **Fix:** Move to a BAA-covered AI path (Google Cloud Vertex AI under a signed BAA, or self-hosted/de-identified pipeline). De-identify transcripts before sending where feasible. Until a BAA exists, this feature cannot legally process US PHI.

### CRITICAL-3 — Plaintext OTP + dev-OTP bypass
- `auth.controller.js:55` inserts the OTP `code` into `otp_codes` in plaintext; `verifyOtp` (`:82-85`) matches the plaintext. Anyone with DB read access (or via CRITICAL-1) sees live login codes.
- `:46-50`: when `USE_DEV_OTP=true` and `DEV_OTP` is set, **every phone's OTP is pinned to `DEV_OTP`** and no SMS is sent. `backend/.env` currently has `USE_DEV_OTP=true` and `DEV_OTP=123456`. Anyone who reaches such an environment logs in as **any phone number** with `123456`.
- **Mitigation present:** `render.yaml` sets `USE_DEV_OTP="false"` and `DEV_OTP=""` for the Render production service — good. But the bypass remains a one-env-var landmine, and plaintext storage + no attempt counter remain regardless.
- **Fix:** Store only a hash (e.g., HMAC-SHA256) of the OTP; add a per-phone failed-attempt counter with lockout; gate `USE_DEV_OTP` behind `NODE_ENV !== 'production'` in code so it cannot be enabled in prod by config alone.

### HIGH-4 — Long-lived bearer tokens, no revocation, localStorage
- `signToken` uses `expiresIn: '30d'` (`auth.controller.js:9`). There is no refresh-token rotation and no server-side revocation list. The V3 auth path (`middleware/auth.js:12-17`) trusts `clinicId`/`role` straight from the JWT and never re-reads `staff.status`, so a **deactivated or role-changed staff member keeps full access for up to 30 days**. Tokens live in `localStorage` (`lib/api/client.js:8-13`), readable by any XSS.
- **Fix:** Short access tokens (15–60 min) + rotating refresh tokens; a `token_version`/revocation check; re-validate `staff.status` on sensitive operations; prefer Capacitor secure storage (or httpOnly cookies for web) over `localStorage`.

### HIGH-5 — Debug code leaks PHI to disk and logs
- `ai.controller.js:35`: `fs.copyFileSync(req.file.path, '/tmp/last_audio_upload')` runs on **every** transcription, leaving the most recent patient's audio at a predictable path, never cleaned. `:42` logs `preview: transcript.slice(0,60)` — patient speech — to stdout (captured by Render). `logger.js` itself says "No PHI should be passed in fields"; this violates it.
- **Fix:** Delete the `copyFileSync` diagnostic; remove transcript previews from logs; add a log-scrubbing layer.

### HIGH-6 — Guessable, never-expiring clinic join codes that auto-grant doctor
- `makeJoinCode()` (`clinic.routes.js:13-18`, duplicated in `transaction.service.js:13`) uses `Math.random()` (not a CSPRNG) for a 6-char code. `joinClinic` (`auth.controller.js:193-209`) lets any authenticated user join as `doctor` with **no owner approval**, and `lookupClinic` confirms a code's validity (oracle for enumeration). Codes don't rotate or expire unless a doctor manually regenerates.
- **Fix:** `crypto.randomBytes` codes; expiring, single-use invites tied to a phone; an approval/pending-member step; default joiners to least privilege (receptionist) with explicit promotion; rate-limit + audit `lookup`/`join`.

### HIGH-7 — Missing HIPAA audit controls
- `audit.service`/`migration 005` capture **writes** (payment, prescription, role change, checkout, consult, clinic create, inventory). A grep for read/access actions (`VIEW|READ|ACCESS|EXPORT`) returns nothing, and there is **no login/auth audit**, no patient create/update/delete audit, and the table stores no IP or user-agent. HIPAA §164.312(b) requires recording **access** to ePHI.
- **Fix:** Log every PHI read (who viewed which patient/case-sheet/x-ray/export), every auth event (OTP sent/verified, success/failure), and patient record mutations; add `ip`, `user_agent`; ship logs to immutable/WORM storage with retention.

### HIGH-8 — No atomicity; payment balance race
- `transaction.service.js:1-5` states supabase-js has no cross-statement transaction, so `confirmConsultationDraft` writes plan→visit→teeth→appointments→prescription→lab-case→queue **sequentially, best-effort**. A mid-sequence failure leaves inconsistent clinical records (e.g., a confirmed draft with no prescription).
- `recordPayment:324-340` reads `collected_amount` then writes `collected_amount + amount` — a classic lost-update race for concurrent payments on one plan (the code comments admit it).
- **Fix:** Move multi-table workflows into Postgres functions (RPC) that run in a real transaction; make balance updates atomic (`update … set collected_amount = collected_amount + $1` or a DB trigger summing payments). Add DB constraints for double-book/queue uniqueness.

*(Medium/Low items are fully specified in the Vulnerability Table §4 with file:line and in the Remediation Plan §10.)*

---

## 6. Reliability Findings
- **Graceful degradation (good):** queue disabled without `DATABASE_URL` → voice/WhatsApp return 503 while the rest serves (`server.js:84-102`); AI provider has key rotation + typed errors + a mock provider fallback in dev (`gemini.provider.js`); storage/reminder failures are non-fatal; OTP send failure deletes the dangling code; graceful SIGTERM shutdown drains jobs.
- **Single points of failure:** one Render web instance runs the API **and** all pg-boss workers in-process — a crash or deploy interrupts in-flight jobs; CPU-bound PDF generation competes with request handling. No health-based autoscaling, no readiness/liveness separation (`/health` is shallow).
- **Atomicity / concurrency:** no DB transactions; payment race; double-booking and queue check-in TOCTOU (§5 HIGH-8, §4 #17).
- **Backups / DR:** no documented backup, restore, or DR procedure in the repo. Supabase provides managed backups (plan-dependent) but PITR, restore drills, and RPO/RTO targets are undefined — unacceptable for medical records.
- **Failure-mode summary:**

| Dependency fails | Current behavior | Risk |
|---|---|---|
| Supabase Postgres | Requests error; some best-effort paths swallow | No circuit breaker; partial writes possible |
| Gemini | Key rotation → `RATE_LIMITED`/`LLM_UNAVAILABLE`; dev mock | Free-tier quota is a hard ceiling under load |
| Sarvam STT | `503 STT_UNAVAILABLE` | Consults blocked; no fallback STT |
| Supabase Storage | Upload non-fatal (warning) | X-ray/audio silently not persisted |
| pg-boss / no DATABASE_URL | Voice/WhatsApp 503; rest works | Inbound WhatsApp messages **lost** (logged) |
| MSG91 SMS | OTP code deleted, 503 to user | Login unavailable; no secondary channel |

---

## 7. Scalability Findings
- **Unbounded queries:** `patients.list` returns the **full** list unless the caller opts into pagination (`controllers/patients.controller.js:17-30`); search uses `.or(name.ilike.%q%,phone.ilike.%q%)` → sequential scans with no trigram index. Memory and latency grow with clinic size.
- **In-memory rate limiter** (`server.js:43`) is per-instance and resets on deploy — it neither works across horizontally-scaled instances nor survives restarts.
- **In-process workers** prevent safe horizontal scaling (duplicate cron/EOD/reminder execution if you run >1 instance without leader election).
- **AI free-tier ceiling:** three round-robined free Gemini keys cap sustained extraction throughput.
- **Capacity estimate (current single-instance design):**

| Users | Outlook |
|---|---|
| 100 | Fine. |
| 1,000 | Fine with pagination enforced; watch Gemini quota. |
| 10,000 | Unbounded lists + in-memory limiter + in-process queue + free-tier AI become the bottleneck. Needs pagination, Redis-backed limiting, externalized workers, paid AI tier. |
| 100,000 | Requires horizontal API scale-out, read replicas, dedicated worker tier with leader election, CDN for assets, and a hardened multi-key/paid AI pipeline. Not achievable without the above. |

---

## 8. Compliance Findings (HIPAA / GDPR)
- **No BAA chain** for Gemini/Sarvam (and Render/Supabase BAAs unverified) — §5 CRITICAL-2.
- **No access/authentication audit trail** — §5 HIGH-7 (HIPAA §164.312(b)).
- **Authentication weaknesses:** plaintext OTP, dev bypass, no lockout — §5 CRITICAL-3.
- **PHI at rest in temp/logs** — §5 HIGH-5.
- **Encryption:** transport TLS is enforced on mobile (`capacitor.config.json` `cleartext:false`); at rest relies solely on Supabase disk encryption — no app-level/column encryption for the most sensitive fields, no documented key management.
- **GDPR/data-subject rights:** no consent capture, no data-retention/erasure (right-to-be-forgotten) mechanism — patients are soft-deleted (`is_deleted`) and their PHI/audio/transcripts persist indefinitely (and copies sit in the AI "dataset" exports). No data-processing records.
- **Minimum-necessary:** dataset export ships raw transcripts + 24h signed audio URLs (§4 #16).

---

## 9. Penetration-Test Simulation (attack paths)

| Attack | Path | Severity | Outcome |
|---|---|---|---|
| **Mass PHI exfiltration** | Extract `NEXT_PUBLIC_SUPABASE_ANON_KEY` from a shipped web/mobile bundle → `GET /rest/v1/patients?select=*` directly (RLS off) | **CRITICAL** (VERIFY LIVE) | Every clinic's PHI dumped, bypassing the API |
| **Auth bypass** | Reach any env with `USE_DEV_OTP=true` → `verify-otp` with `123456` for any phone | **CRITICAL** | Full account takeover |
| **OTP brute-force** | `verify-otp` with rotating IPs; 6-digit space, 10-min window, no per-phone lockout | **HIGH** | Account takeover of a targeted phone |
| **Clinic takeover** | Guess/leak a `Math.random` join code, validate via `lookup-clinic`, `join-clinic` as `doctor` | **HIGH** | Full PHI access to the victim clinic, no approval |
| **Persistent access after offboarding** | Fired staff keeps a 30-day JWT; V3 path never re-checks `staff.status` | **HIGH** | Continued PHI access up to 30 days |
| **PHI at rest** | Read `/tmp/last_audio_upload` / Render logs on a compromised host | **HIGH** | Latest patient audio + transcript previews |
| **Token theft via XSS** | Any XSS (incl. dependency) → read `localStorage.dentai_token` | **MEDIUM** | 30-day session theft |
| **Filter injection** | Craft `q` / spoofed webhook `from` into `.or()` strings | **MEDIUM** | Within-clinic query manipulation / errors |
| **Arbitrary file upload** | Upload non-image as "x-ray" (extension-only validation); path-manipulate via `patientId` | **MEDIUM** | Storage abuse, unexpected object prefixes |
| **Financial drift** | Fire concurrent payments on one plan | **MEDIUM** | Lost-update → incorrect balances |
| **User enumeration** | Compare `verify-otp` response (`isNewUser`/`needsClinic`) | **LOW** | Identify registered phones |

---

## 10. Remediation Plan

### Critical — fix immediately (before any real PHI)
1. **Enable RLS on every `public` table** with `clinic_id` policies; verify in the Supabase dashboard; treat the anon key as public. *Example:*
   ```sql
   alter table public.patients enable row level security;
   -- service-role (backend) bypasses RLS; deny anon/authenticated by default:
   revoke all on public.patients from anon, authenticated;
   -- (repeat for every table holding PHI)
   ```
2. **Stop sending PHI to non-BAA AI.** Switch to Vertex AI (or another vendor) under a signed BAA, or de-identify before send; gate the feature off until the BAA is in place. Confirm/obtain BAAs with Supabase and Render too.
3. **Hash OTPs + remove the dev bypass from prod by code, not config:**
   ```js
   const codeHash = crypto.createHmac('sha256', process.env.OTP_PEPPER).update(otp).digest('hex');
   // store codeHash; on verify, HMAC the input and compare; increment attempts; lock after 5.
   const devOtpAllowed = process.env.NODE_ENV !== 'production' && process.env.USE_DEV_OTP === 'true';
   ```

### High — fix before production launch
4. Short-lived access tokens + rotating refresh tokens + revocation (`token_version`); re-check `staff.status` on sensitive ops; move token off `localStorage`.
5. Delete `fs.copyFileSync(... '/tmp/last_audio_upload')` and transcript log previews; add log scrubbing.
6. CSPRNG, expiring, single-use, approval-gated clinic invites; default new members to `receptionist`.
7. Audit **every** PHI read, auth event, and patient mutation; add `ip`/`user_agent`; WORM retention.
8. Wrap multi-table clinical writes in Postgres RPC transactions; make payment balance updates atomic; add DB uniqueness constraints for slots/queue.

### Medium — harden
9. Restrict CORS to an allow-list of known app origins. 10. Per-phone OTP lockout; constant-shape verify responses. 11. Magic-byte file validation + extension allow-list + validate `patientId` ∈ clinic + sanitize storage keys. 12. Parameterize/escape `.or()` inputs (or switch to `textSearch`/explicit `.ilike` value args). 13. Add CSP + security headers to the web app (Next `headers()` or edge). 14. Re-verify OTP on phone change. 15. Require WhatsApp signature verification in all non-stub modes; fail closed on empty secret. 16. Shorten signed-URL TTLs for PHI; avoid bundling URLs in exports by default. 17. DB constraints for double-book/queue. 18. Move secrets to a manager (Render env / Supabase Vault); rotate the keys currently in `backend/.env`.

### Low — cleanup
19. `npm audit fix` on the frontend (or upgrade tooling). 20. Protect the clinic owner from deactivation. 21. Fix `.env.production` to the real HTTPS API URL. 22. Suppress raw AI-output `details` in client errors. 23. Plan column/field encryption + key management for the most sensitive PHI. 24. Keep transcript slices out of audit metadata.

---

### Appendix — What's already done well (keep it)
Consistent `clinic_id` tenant scoping across the API; Zod validation with mass-assignment protection (`middleware/validate.js`); parameterized supabase-js queries; `helmet`; HMAC + `timingSafeEqual` webhook verification; idempotency gates (draft-confirm claim, 23505 webhook replay handling); graceful degradation and typed errors; `render.yaml` keeps secrets out of git and disables dev-OTP in prod; backend has **0** npm vulnerabilities.
