# DentAI V2 — Tooth Chart + Cost Extraction + Recent Appointments

**Date:** 2026-06-03  
**Status:** Approved  
**Stack:** Next.js 16 (app router) + Express backend + Supabase + Capacitor

---

## Overview

Add three feature groups to the existing DentAI codebase on top of the Option 2 (API-first) approach:

1. **Cost extraction** — AI extracts ₹ amount from voice dictation, stores it with visits, displays it in patient billing
2. **Tooth Map connected to real data** — wire the existing `Odontogram.jsx` to live `/api/patients/:id/tooth-history` data; show real procedure history per tooth in `ToothDetailSheet`
3. **Recent appointments on dashboard** — the backend already returns `recentAppointments` from `/api/analytics/dashboard`; render it in the home screen

**Constraint:** Zero UI redesign. All new screens and sections use the exact existing component styles, colors, spacing, and layout patterns from the codebase.

---

## What Already Exists (Do Not Rebuild)

| Item | Location | Status |
|---|---|---|
| FDI arch SVG chart | `components/odontogram/Odontogram.jsx` | Complete, no changes |
| Tooth chip | `components/ui/ToothChip.jsx` | Complete, no changes |
| Tooth detail sheet | `components/sheets/ToothDetailSheet.jsx` | Needs real data wired in |
| `/api/patients/:id/tooth-history` | `backend/src/routes/patients.routes.js` | Complete |
| `/api/analytics/dashboard` with `recentAppointments` | `backend/src/routes/analytics.routes.js` | Complete |
| `visits` table `cost` + `currency` columns | Supabase schema | Complete |
| `appointments` table `tooth_number` column | Supabase schema | Complete |
| All frontend service files | `dentai-app/lib/services/` | Complete |

---

## Section 1 — Backend Changes

### Already complete — do not rebuild

| Item | File | Status |
|---|---|---|
| `POST /api/ai/generate-note` (with cost + toothNumber extraction) | `backend/src/controllers/ai.controller.js` `exports.generateNote` | **Already fully implemented** |
| Route registered | `backend/src/routes/ai.routes.js` | **Already registered** |
| Frontend `generateNote()` service call | `dentai-app/lib/services/ai.service.js` | **Already exists** |
| `useGenerateNote` hook (maps `raw.cost` → `estimatedCost`) | `dentai-app/lib/hooks/useGenerateNote.js` | **Already exists** |
| `RecordDiagnosisSheet` uses real audio → transcribe → generateNote pipeline | `dentai-app/components/sheets/RecordDiagnosisSheet.jsx` | **Already working** |

### 1.1 Fix `completeConsult` payload in `dentai-app/store/useQueueStore.js`

The `completeConsult` action currently calls `apiCompleteConsult` with only `transcript`, `structuredNote`, `medicines`, `instructions`, `followUp`. The backend `/api/queue/:id/complete-consult` expects `patientId`, `procedure`, `toothNumber`, `estimatedCost`, `totalSittings`, `diagnosis`.

The `consult` object from `useGenerateNote` already has all these fields mapped. Fix the payload:

```js
await apiCompleteConsult(id, {
  patientId:      entry.patientId,         // from queue entry
  procedure:      consult?.procedure || '',
  diagnosis:      consult?.diagnosis || '',
  toothNumber:    consult?.tooth ? String(consult.tooth) : null,
  totalSittings:  consult?.totalSittings || 1,
  estimatedCost:  consult?.estimatedCost || 0,
  transcript:     consult?.transcript || '',
  notes:          consult?.instructions || '',
  medicines:      consult?.medicines || [],
  instructions:   consult?.instructions || '',
  followUp:       consult?.followUp || '',
});
```

The `entry` is available in the store action via `get().queue.find(e => e.id === id)`.

### 1.2 Add `tooth_number` to appointments insert

In `backend/src/controllers/appointments.controller.js`, `create` function:
- Read `toothNumber` from `req.body`
- Add `tooth_number: toothNumber || null` to the Supabase insert payload

---

## Section 2 — Frontend Service Layer

### Already complete — do not rebuild

`lib/services/ai.service.js` already exports `generateNote(transcript)` calling `POST /api/ai/generate-note`.

### 2.1 Add to `lib/services/patient.service.js`

```js
export async function getToothHistory(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/tooth-history`);
  return data;
}
```

`getPatientVisits` is not needed — visits come from the patient detail call `GET /api/patients/:id` which already joins `visits(*)` in the backend query.

### 2.2 Add `lib/services/visit.service.js` (new file)

Only needed for the cost display in billing tab (reading visits with cost). The `getPatient(id)` call already returns `visits` nested, but they may not include `cost`. Confirm by checking the backend patients controller join — if `cost` is missing, add it to the select.

```js
export async function listVisits(patientId) {
  const { data } = await apiClient.get('/api/visits', { params: { patientId } });
  return data; // { visits: [...] }
}
```

---

## Section 3 — Dashboard (`app/page.jsx`)

The `analytics` state is already fetched and contains `recentAppointments: []`.

**Add below the existing content:** A "Recent Appointments" section using the exact same `Eyebrow` + card pattern already in the file.

- Render up to 5 entries from `analytics.recentAppointments`
- Each row: patient name, date, purpose, `ToothChip` if `tooth_number` present, status dot
- Use existing `StatusChip` for appointment status
- Tapping a row navigates to `/patients/:patientId`
- Only render the section if `analytics?.recentAppointments?.length > 0`

---

## Section 4 — Patient Profile (`app/patients/[id]/PatientProfileClient.jsx`)

### 4.1 Data migration

Replace local Zustand store reads with direct API calls on mount:

```js
// On mount (useEffect):
const [patient, setPatient] = useState(null)
const [visits, setVisits] = useState([])
const [toothHistory, setToothHistory] = useState(null)
const [loading, setLoading] = useState(true)

// Fetch in parallel:
Promise.all([
  getPatient(patientId),
  getPatientVisits(patientId),
  getToothHistory(patientId),
])
```

Keep using `useAppStore` for sheets/toasts. Keep `usePatientStore` only for `addPatient`/`updatePatient` mutations.

### 4.2 Three tabs using existing `PillToggle`

```jsx
<PillToggle
  options={['Overview', 'Tooth Map', 'Billing']}
  value={tab}
  onChange={setTab}
/>
```

**Tab 1 — Overview:** Same content as today. Replace local mock visits with `visits` from API. Show `cost` alongside each visit row if present (e.g. "₹3,500" in the same `t-meta` style used elsewhere).

**Tab 2 — Tooth Map:**
- `Odontogram` component with `teeth` prop built from `toothHistory.toothMap`:
  ```js
  // Procedure name → state mapping (hybrid):
  function procedureToState(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('root canal') || n.includes('rct') || n.includes('pulpectomy')) return 'rct';
    if (n.includes('crown') || n.includes('cap')) return 'crown';
    if (n.includes('extraction') || n.includes('removal')) return 'extraction';
    if (n.includes('filling') || n.includes('composite') || n.includes('restoration')) return 'filling';
    if (n.includes('implant')) return 'implant';
    if (n.includes('infection') || n.includes('abscess') || n.includes('periapical')) return 'infection';
    return 'rct'; // fallback for any other completed procedure — dark so it's visible
  }
  // Build teeth map: last procedure on each tooth wins
  const teethMap = {};
  toothHistory.toothMap.forEach(t => {
    const lastProc = t.completedProcedures[0]; // already sorted DESC by date
    if (lastProc) teethMap[t.toothNumber] = procedureToState(lastProc.procedure);
    if (t.upcomingAppointments.length > 0) teethMap[t.toothNumber] = 'scheduled'; // scheduled overrides
  });
  ```
- `onTooth` callback: open `ToothDetailSheet` via `openSheet('toothDetail', { tooth: n, toothData, patientId })`

**Tab 3 — Billing:**
- Total billed card (same `card` class as elsewhere): `₹{toothHistory.totalBilled.toLocaleString('en-IN')}`
- Per-visit list: procedure name, date, tooth chip if set, cost right-aligned
- Only visits with `cost != null` show a cost; others show `—`
- Sorted by date descending

### 4.3 `ToothDetailSheet.jsx` update

Accept `toothData` (from tooth-history response) in `params`. If `toothData` present, render procedure history below the existing state buttons:

- Section header "Procedure History"
- For each `completedProcedure`: procedure name, date, cost if present — same row style used throughout the app
- If `toothData.upcomingAppointments.length > 0`: show a scheduled appointment row at the top using the amber `scheduled` chip

The existing state-editing UI stays intact above this new section.

---

## Section 5 — Consultation Cost Wiring

**Location:** `dentai-app/store/useQueueStore.js` — `completeConsult` action (see Section 1.1 above).

The `RecordDiagnosisSheet.jsx` already:
- Records audio → transcribes via Sarvam → calls `generateFromTranscript` (which calls `POST /api/ai/generate-note`)
- Gets back a `consult` object with `{ procedure, tooth, estimatedCost, totalSittings, medicines, ... }`
- Calls `completeConsult(entry.id, { ...extraction, transcript })`

The only missing piece: `completeConsult` in `useQueueStore` strips those fields before sending to the backend. The fix is in Section 1.1 — pass the full payload through to `apiCompleteConsult`.

**No UI changes needed in `RecordDiagnosisSheet.jsx`** — the cost is already extracted by AI and passed through `estimatedCost`. The `complete-consult` backend route already uses it to set `estimated_cost` on the treatment plan.

---

## Section 6 — Procedure-to-State Mapping Reference

| Keyword(s) | Odontogram state | Visual |
|---|---|---|
| root canal, rct, pulpectomy | `rct` | Black fill |
| crown, cap | `crown` | Purple |
| extraction, removal | `extraction` | Red |
| filling, composite, restoration | `filling` | Blue |
| implant | `implant` | Light blue |
| infection, abscess, periapical | `infection` | White + red badge |
| upcoming appointment | `scheduled` | Amber (overrides completed) |
| anything else completed | `rct` | Black (visible fallback) |

---

---

## Section 7 — New User Onboarding Flow Fix

### Problem

When a brand-new phone number verifies OTP, the backend returns `{ token, dentist, isNewUser: true }` with no `staff` or `clinic`. The login page currently checks `if (!clinicData.id)` and routes straight to `/doctor/setup` — skipping role selection and the create-vs-join choice entirely.

### Required Flow (post-OTP for new users)

```
OTP verified (isNewUser: true)
  ↓
Step A — Role selection: "Are you a Doctor or Receptionist?"
  ├── Doctor →
  │     Step B — "Create a new clinic" or "Join an existing clinic"
  │       ├── Create → /doctor/setup  (existing, unchanged)
  │       └── Join   → enter join code → joinClinic API → home
  └── Receptionist →
        Step B — Enter clinic join code → joinClinic API → /reception
```

### Implementation

**`app/login/page.jsx`** — add two new inline steps after OTP verification:

- New `phase` values: `'role'` and `'clinic_choice'` (for doctors only)
- Current routing logic (`if (!clinicData.id) router.replace('/doctor/setup')`) becomes: set `phase = 'role'` and store `dentistId` from response

**Step A — Role selection UI** (phase = `'role'`):

Two large tappable cards in the existing app style:
- "I'm a Doctor" — sets `selectedRole = 'doctor'`, advances to `'clinic_choice'`
- "I'm a Receptionist" — sets `selectedRole = 'receptionist'`, advances to `'join'`

**Step B — Clinic choice for doctors** (phase = `'clinic_choice'`):

Two tappable cards:
- "Create a new clinic" → `router.push('/doctor/setup')`
- "Join an existing clinic" → advances to `phase = 'join'`

**Step B — Join clinic** (phase = `'join'`, used by both roles):

Reuse the join-clinic UI already in `app/roles/page.jsx` — but inline it into the login page so the user doesn't navigate away (simpler than routing). Fields: join code input + lookup + confirm. On success call `joinClinic(code, selectedRole, name)` → `hydrateAuth` → redirect based on role.

**Existing `app/roles/page.jsx`** stays as-is (used for existing users switching clinics). The new inline steps are only triggered when `isNewUser: true`.

---

## Section 8 — Settings: Show Real Data + Clinic Join Code

### Problem

`AccountSettingsSheet.jsx` reads from hardcoded `STAFF` and `CLINIC` mock objects (`lib/data/queue.js`). The clinic `join_code` is already stored in `useAppStore` as `clinic.joinCode` (populated in both `setAuth` and `hydrateAuth`) but never displayed.

### Implementation

**`components/sheets/AccountSettingsSheet.jsx`** — two changes:

1. **Replace mock data with store:**
   ```js
   // Remove:
   import { STAFF, CLINIC } from '@/lib/data/queue';
   // Add:
   const name     = useAppStore((s) => s.name);
   const role     = useAppStore((s) => s.role);
   const clinic   = useAppStore((s) => s.clinic);
   ```
   Use `name` instead of `staff.name`, `clinic.clinicName` + `clinic.city` instead of `CLINIC.name` + `CLINIC.city`.

2. **Add Clinic Code row** in the settings card, after "Clinic name":
   - Label: "Clinic join code"
   - Value: `clinic.joinCode` displayed prominently (large monospaced text, e.g. `DENT-ABC-123`)
   - A copy-to-clipboard tap action using `navigator.clipboard.writeText`
   - Only render if `clinic.joinCode` is truthy
   - Style: same row layout as other settings rows, value right-aligned in accent color

---

## Out of Scope

- No changes to `Odontogram.jsx` rendering
- No changes to schedule, finance, reception, or queue screens
- No new npm packages
- No Capacitor build changes
- No changes to existing sheet layouts beyond `ToothDetailSheet` data wiring and `AccountSettingsSheet` fix above
