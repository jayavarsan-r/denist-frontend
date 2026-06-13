# Change Tracker — Testing & Run Tooling (2026-06-08)

Additions that make the project easy to run and verify automatically. No app behavior changed.

---

## 1. One-command project runner — `run.sh`
**File:** `run.sh` (repo root, executable)

`./run.sh` starts the whole stack and cleans up on Ctrl+C. It removes the recurring footguns
from this stack (two dirs, two processes, port clashes, wrong port).

What it does:
1. **Pre-flight** — checks `node`; warns if `ffmpeg`, `dentai-app/.env.local`, or `backend/.env` are missing.
2. **Frees ports 3000 & 4000** — kills stale processes first (no EADDRINUSE / wrong-port).
3. **Installs deps** only if `node_modules` is missing.
4. **Starts** backend on `:4000` + frontend on `:3000`, logging each to a temp file.
5. **Waits until both answer**; if one crashes on boot it prints that log and aborts.
6. Prints URLs + dev login (`1234567891` / `123456`), then **streams both logs**.
7. **Ctrl+C** kills both and frees the ports.

> Does NOT run Supabase migrations — those are one-time manual steps (007 lab/multi-tooth, 008 appointment duration).

```bash
./run.sh        # start everything; Ctrl+C stops both
```

---

## 2. End-to-end feature smoke test — `backend/scripts/smoke.js`
**Files:** `backend/scripts/smoke.js`, `backend/package.json` (`"smoke": "node scripts/smoke.js"`)

A dependency-free Node script (Node 18+ global fetch) that exercises **every major backend
feature** against the running server and prints a PASS/FAIL summary, exiting non-zero on failure
(CI-friendly).

**Coverage (24 checks, all green):**
auth → create-clinic → patient (create / get / case-sheet / tooth-history) → queue add →
**multi-tooth consult + follow-up** → **checkout-summary** → lab (create / clinic list / patient
list / mark-received) → appointments (create w/ duration, list, **cancelled-excluded**, today,
booked-slots) → **AI parse-schedule / generate-note / extract-patient-info** → **Sarvam
transcription** (auto-generates speech via `say` + `ffmpeg`) → soft-delete cleanup.

> Integration test — creates real rows in Supabase under the demo login (a "Smoke" clinic/patient,
> then soft-deletes the patient). Point it at a test/demo clinic.

```bash
PORT=4000 npm start          # terminal 1
npm run smoke                # terminal 2  → 24/24 passed
# override: BASE=… PHONE=… OTP=… node scripts/smoke.js
```

---

## 3. Fixed broken unit tests — `npm test`
**File:** `backend/package.json`

**Bug:** the test script used `jest --testPathPattern=tests`; the installed Jest renamed that flag
to `--testPathPatterns`, so `npm test` **errored and ran nothing**.
**Fix:** changed the script to `jest` (auto-discovers `tests/*.test.js`).

Result: **25 unit tests across 5 suites pass** (medicine parser, validators, base repository,
response envelope, pagination).

```bash
cd backend && npm test       # 25 passed
```

---

## Testing layers — summary
| Layer | Command | Status |
|------|---------|--------|
| Unit (pure logic) | `cd backend && npm test` | ✅ 25 passing |
| API / feature E2E | `npm run smoke` (server running) | ✅ 24 passing |
| Frontend UI E2E (Playwright) | — | ❌ not set up (optional next step) |

**Not done yet (optional):** Playwright browser E2E for the UI (login → record diagnosis →
schedule → checkout), Jest tests for new backend logic (scheduling slot finder, multi-tooth, lab
routes), and a CI workflow running `npm test` + `npm run smoke` on push.
