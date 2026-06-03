# DentAI V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire tooth-history API data to the existing ToothMapTab + BillingTab, fix consultation cost saving, display recent appointments on dashboard, fix new-user onboarding flow, and show clinic join code in settings.

**Architecture:** All changes are additive on top of the existing tabbed PatientProfile and Zustand store layer. No new UI components are created — we feed real API data into the existing `ToothMapTab`, `BillingTab`, `ToothDetailSheet`, and `RecordDiagnosisSheet` components. Auth fixes are inline state additions to `app/login/page.jsx`.

**Tech Stack:** Next.js 16 (app router), Zustand, `apiClient` (axios), Supabase backend via Express, Capacitor mobile shell.

---

## File Map

| Status | File | Change |
|---|---|---|
| Modify | `dentai-app/store/useQueueStore.js` | Fix `completeConsult` payload |
| Modify | `dentai-app/lib/services/patient.service.js` | Add `getToothHistory` |
| Create | `dentai-app/lib/services/visit.service.js` | New `listVisits` service |
| Modify | `dentai-app/app/page.jsx` | Render `recentAppointments` |
| Modify | `dentai-app/app/patients/[id]/PatientProfileClient.jsx` | Fetch `toothHistory`, wire tabs |
| Modify | `dentai-app/components/sheets/ToothDetailSheet.jsx` | Show real procedure history |
| Modify | `dentai-app/app/login/page.jsx` | New-user role+clinic flow |
| Modify | `dentai-app/components/sheets/AccountSettingsSheet.jsx` | Real data + join code |

---

## Task 1: Fix `completeConsult` payload

**Files:**
- Modify: `dentai-app/store/useQueueStore.js:63-94`

- [ ] **Step 1: Open `useQueueStore.js` and find the `completeConsult` action (line 63). Replace the entire action with:**

```js
completeConsult: async (id, consult) => {
  const entry = get().queue.find(e => e.id === id);
  // Optimistic update
  set((s) => {
    let next = s.queue.map((e) =>
      e.id === id
        ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: nowTime(), consult }
        : e
    );
    const waiting = next
      .filter((e) => e.status === 'waiting')
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    if (waiting[0]) {
      next = next.map((e) =>
        e.id === waiting[0].id ? { ...e, status: 'in_consultation', calledInAt: nowTime() } : e
      );
    }
    return { queue: next };
  });
  try {
    await apiCompleteConsult(id, {
      patientId:     entry?.patientId || '',
      procedure:     consult?.procedure || '',
      diagnosis:     consult?.diagnosis || '',
      toothNumber:   consult?.tooth ? String(consult.tooth) : null,
      totalSittings: consult?.totalSittings || 1,
      estimatedCost: consult?.estimatedCost || 0,
      transcript:    consult?.transcript || '',
      notes:         consult?.instructions || '',
      medicines:     consult?.medicines || [],
      instructions:  consult?.instructions || '',
      followUp:      consult?.followUp || '',
    });
  } catch {
    get().loadQueue();
  }
},
```

- [ ] **Step 2: Verify the backend route accepts these fields**

```bash
grep -A 15 "complete-consult" /Users/jayavarsan/Desktop/dentai/backend/src/routes/queue.routes.js | head -20
```

Expected: see `patientId`, `procedure`, `toothNumber`, `estimatedCost` destructured.

- [ ] **Step 3: Commit**

```bash
cd /Users/jayavarsan/Desktop/dentai
git add dentai-app/store/useQueueStore.js
git commit -m "fix: pass procedure, tooth, cost in completeConsult API payload"
```

---

## Task 2: Add service functions

**Files:**
- Modify: `dentai-app/lib/services/patient.service.js`
- Create: `dentai-app/lib/services/visit.service.js`

- [ ] **Step 1: Add `getToothHistory` to the bottom of `lib/services/patient.service.js` (before the last line)**

```js
export async function getToothHistory(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/tooth-history`);
  return data; // { patientId, toothMap: [...], generalVisits: [...], totalBilled: number }
}
```

- [ ] **Step 2: Create `dentai-app/lib/services/visit.service.js`**

```js
import { apiClient } from '../api/client';

export async function listVisits(patientId) {
  const { data } = await apiClient.get('/api/visits', { params: { patientId } });
  return data; // { visits: [...] }
}

export async function createVisit(visitData) {
  const { data } = await apiClient.post('/api/visits', visitData);
  return data;
}
```

- [ ] **Step 3: Verify the backend route exists**

```bash
curl -s http://localhost:3000/api/patients/TEST/tooth-history \
  -H "Authorization: Bearer INVALID" | head -c 100
```

Expected: `{"error":"Unauthorised"}` or similar — confirms route exists.

- [ ] **Step 4: Commit**

```bash
git add dentai-app/lib/services/patient.service.js dentai-app/lib/services/visit.service.js
git commit -m "feat: add getToothHistory and visit service"
```

---

## Task 3: Dashboard — render `recentAppointments`

**Files:**
- Modify: `dentai-app/app/page.jsx`

The `analytics` state already contains `recentAppointments` from the API. We need to render it after the existing "Today" section.

- [ ] **Step 1: In `app/page.jsx`, add this block immediately before the `{/* tail spacing */}` comment (after the closing `</div>` of the "today" section):**

```jsx
{/* recent appointments — from analytics API */}
{analytics?.recentAppointments?.length > 0 && (
  <div style={{ padding: '26px 22px 0' }}>
    <Eyebrow action={<button onClick={() => router.push('/schedule')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>See all</button>}>Recent appointments</Eyebrow>
    <div>
      {analytics.recentAppointments.slice(0, 5).map((appt, i) => {
        const patientName = appt.patients?.name || 'Patient';
        const patientId = appt.patients?.id || appt.patient_id;
        const dot = { scheduled: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--text-tertiary)', arrived: 'var(--orange)' }[appt.status] || 'var(--text-tertiary)';
        return (
          <button key={appt.id} onClick={() => router.push('/patients/' + patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 600 }}>{patientName}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{appt.appointment_date}</span>
                {appt.purpose && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{appt.purpose}</span></>}
                {appt.tooth_number && <><span>·</span><span style={{ color: 'var(--blue)', fontWeight: 600 }}>T{appt.tooth_number}</span></>}
              </div>
            </div>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 2: Check it renders — open the app at `http://localhost:3001` and log in. If `analytics.recentAppointments` has data, the section should appear below "Today".**

- [ ] **Step 3: Commit**

```bash
git add dentai-app/app/page.jsx
git commit -m "feat: show recent appointments on dashboard"
```

---

## Task 4: PatientProfile — fetch toothHistory and wire teeth map

**Files:**
- Modify: `dentai-app/app/patients/[id]/PatientProfileClient.jsx`

The `PatientProfile` function component (line ~320) uses `patients.find(...)` from local store. We need to:
1. Add `getToothHistory` import
2. Add `toothHistory` state + `useEffect` to fetch it
3. Add `fetchPatient` call if patient not in store
4. Build `teethMap` from `toothHistory` for the Odontogram

- [ ] **Step 1: Add import at the top of `PatientProfileClient.jsx` (alongside existing imports):**

```js
import { getToothHistory } from '@/lib/services/patient.service';
```

Also add `fetchPatient` to the existing `usePatientStore` import (it's already in the store, just needs destructuring):

```js
const fetchPatient = usePatientStore(s => s.fetchPatient);
```

- [ ] **Step 2: In the `PatientProfile` function, add state + effects after the existing `const [tab, setTab]` line:**

```js
const [toothHistory, setToothHistory] = React.useState(null);
const [toothLoading, setToothLoading] = React.useState(false);

// Ensure patient is loaded if navigated directly
React.useEffect(() => {
  if (!patients.find(x => x.id === patientId)) {
    fetchPatient(patientId);
  }
}, [patientId]);

// Fetch tooth history from API
React.useEffect(() => {
  if (!patientId) return;
  setToothLoading(true);
  getToothHistory(patientId)
    .then(data => setToothHistory(data))
    .catch(() => {})
    .finally(() => setToothLoading(false));
}, [patientId]);
```

- [ ] **Step 3: Add the `procedureToState` helper and `buildTeethMap` function immediately before the `PatientProfile` function definition:**

```js
function procedureToState(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('root canal') || n.includes('rct') || n.includes('pulpectomy')) return 'rct';
  if (n.includes('crown') || n.includes('cap')) return 'crown';
  if (n.includes('extraction') || n.includes('removal')) return 'extraction';
  if (n.includes('filling') || n.includes('composite') || n.includes('restoration')) return 'filling';
  if (n.includes('implant')) return 'implant';
  if (n.includes('infection') || n.includes('abscess') || n.includes('periapical')) return 'infection';
  return 'rct';
}

function buildTeethMap(toothHistory) {
  const map = {};
  if (!toothHistory?.toothMap) return map;
  toothHistory.toothMap.forEach(t => {
    if (t.upcomingAppointments?.length > 0) {
      map[t.toothNumber] = 'scheduled';
    } else if (t.completedProcedures?.length > 0) {
      map[t.toothNumber] = procedureToState(t.completedProcedures[0]?.procedure);
    }
  });
  return map;
}
```

- [ ] **Step 4: In `PatientProfile`, compute the merged teeth map after the `p` lookup:**

```js
// Merge: API tooth history overrides local p.teeth
const apiTeethMap = buildTeethMap(toothHistory);
const mergedTeeth = Object.keys(apiTeethMap).length > 0
  ? { ...p.teeth, ...apiTeethMap }
  : p.teeth;
```

- [ ] **Step 5: Update the `ToothMapTab` call in the tab renderer to pass `toothHistory` and the merged teeth map:**

Find this line:
```jsx
{tab === 'Tooth Map' && <ToothMapTab p={p} bills={bills} openSheet={openSheet} />}
```
Replace with:
```jsx
{tab === 'Tooth Map' && <ToothMapTab p={{ ...p, teeth: mergedTeeth }} bills={bills} openSheet={openSheet} toothHistory={toothHistory} toothLoading={toothLoading} />}
```

- [ ] **Step 6: Commit**

```bash
git add dentai-app/app/patients/[id]/PatientProfileClient.jsx
git commit -m "feat: fetch tooth history and build real teeth map in patient profile"
```

---

## Task 5: ToothMapTab — use real API data

**Files:**
- Modify: `dentai-app/app/patients/[id]/PatientProfileClient.jsx` (the `ToothMapTab` function, around line 175)

The existing `ToothMapTab` uses `p.teeth` for the Odontogram (now already merged in Task 4) and shows a "Treated teeth" list from `p.teeth`. We need to enhance it to show real procedure names and costs when `toothHistory` is available.

- [ ] **Step 1: Update the `ToothMapTab` function signature to accept `toothHistory` and `toothLoading`:**

Find:
```js
function ToothMapTab({ p, bills, openSheet }) {
```
Replace with:
```js
function ToothMapTab({ p, bills, openSheet, toothHistory, toothLoading }) {
```

- [ ] **Step 2: Update the `onTooth` callback in the `Odontogram` inside `ToothMapTab` to pass real toothData to the sheet:**

Find:
```jsx
<Odontogram teeth={p.teeth} onTooth={(n) => openSheet('tooth', { tooth: n, state: p.teeth[n] || 'healthy', patientId: p.id })} />
```
Replace with:
```jsx
<Odontogram
  teeth={p.teeth}
  onTooth={(n) => {
    const toothData = toothHistory?.toothMap?.find(t => t.toothNumber === String(n));
    openSheet('tooth', { tooth: n, state: p.teeth[n] || 'healthy', patientId: p.id, toothData });
  }}
/>
```

- [ ] **Step 3: Replace the "Treated teeth" list section in `ToothMapTab`. Find the block that starts with `<SectionHeader>Treated teeth</SectionHeader>` and replace the inner list items to show real procedure names when available:**

Find (the inner map inside the `treated.map` section):
```jsx
<div style={{ fontSize: 16, fontWeight: 600 }}>Tooth {num}</div>
<div className="t-meta">{STATE_LABEL[st] || st}</div>
```
Replace with:
```jsx
<div style={{ fontSize: 16, fontWeight: 600 }}>Tooth {num}</div>
<div className="t-meta">
  {(() => {
    const td = toothHistory?.toothMap?.find(t => t.toothNumber === String(num));
    const lastProc = td?.completedProcedures?.[0];
    if (lastProc) return lastProc.procedure + (lastProc.cost ? ` · ₹${Math.round(lastProc.cost).toLocaleString('en-IN')}` : '');
    return STATE_LABEL[st] || st;
  })()}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add dentai-app/app/patients/[id]/PatientProfileClient.jsx
git commit -m "feat: show real procedure names and costs in ToothMapTab"
```

---

## Task 6: ToothDetailSheet — show real procedure history

**Files:**
- Modify: `dentai-app/components/sheets/ToothDetailSheet.jsx`

The existing sheet shows tooth state buttons and a notes field. We add a "Procedure history" section below when `params.toothData` is provided.

- [ ] **Step 1: Replace the entire `ToothDetailSheet` component with:**

```jsx
'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { SheetHeader, SectionHeader, PrimaryButton, Field } from '@/components/ui';
import { TOOTH_STATE_STYLE } from '@/lib/data/procedures';
import { formatDate } from '@/lib/data/utils';

const TOOTH_STATES = ['healthy', 'filling', 'rct', 'crown', 'implant', 'extraction', 'infection', 'scheduled'];
const TOOTH_STATE_LABEL = { healthy: 'Healthy', filling: 'Filling', rct: 'Root canal', crown: 'Crown', implant: 'Implant', extraction: 'Extraction', infection: 'Infection', scheduled: 'Scheduled' };

export default function ToothDetailSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const updateToothState = usePatientStore((s) => s.updateToothState);
  const [state, setState] = useState(params.state || 'healthy');
  const [notes, setNotes] = useState('');
  const toothData = params.toothData || null;

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Tooth ${params.tooth}`} onClose={onClose} />
      <SectionHeader>State</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {TOOTH_STATES.map(s => {
          const active = state === s; const c = TOOTH_STATE_STYLE[s];
          return <button key={s} onClick={() => setState(s)} style={{ height: 36, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: active ? `1.5px solid ${c.stroke}` : '1px solid var(--border)', background: active ? c.fill : '#fff', color: active ? (s === 'rct' ? 'var(--text-primary)' : c.num) : 'var(--text-secondary)' }}>{TOOTH_STATE_LABEL[s]}</button>;
        })}
      </div>
      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Clinical notes for this tooth…" mic minHeight={50} onMic={() => showToast('Listening…')} />

      {/* Procedure history from API */}
      {toothData && toothData.completedProcedures?.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionHeader>Procedure history</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {toothData.completedProcedures.map((proc, i) => (
              <div key={proc.visitId || i} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{proc.procedure}</div>
                  {proc.cost != null && (
                    <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', flexShrink: 0, marginLeft: 8 }}>₹{Math.round(proc.cost).toLocaleString('en-IN')}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{proc.date ? formatDate(proc.date) : ''}</div>
                {proc.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>{proc.notes}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upcoming appointment for this tooth */}
      {toothData && toothData.upcomingAppointments?.length > 0 && (
        <>
          <SectionHeader>Upcoming</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {toothData.upcomingAppointments.map((appt, i) => (
              <div key={appt.appointmentId || i} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{appt.purpose || 'Appointment'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{appt.date} {appt.time ? '· ' + appt.time : ''}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 22 }} />
      <PrimaryButton onClick={() => { updateToothState(params.patientId, params.tooth, state); showToast(`Tooth ${params.tooth} updated`); onClose(); }}>Save</PrimaryButton>
    </div>
  );
}
```

- [ ] **Step 2: Verify `formatDate` is exported from utils**

```bash
grep "export.*formatDate" /Users/jayavarsan/Desktop/dentai/dentai-app/lib/data/utils.js | head -3
```

Expected: a line containing `formatDate`.

- [ ] **Step 3: Commit**

```bash
git add dentai-app/components/sheets/ToothDetailSheet.jsx
git commit -m "feat: show real procedure history and costs in ToothDetailSheet"
```

---

## Task 7: BillingTab — add real visit costs

**Files:**
- Modify: `dentai-app/app/patients/[id]/PatientProfileClient.jsx` (the `BillingTab` function and its call in the renderer)

The existing `BillingTab` shows local mock bills. We add a "Visit costs" section showing real API costs from `toothHistory`.

- [ ] **Step 1: Update the `BillingTab` function signature:**

Find:
```js
function BillingTab({ p, bills, prescriptions, labOrders, visits, procedures, openSheet }) {
```
Replace with:
```js
function BillingTab({ p, bills, prescriptions, labOrders, visits, procedures, openSheet, toothHistory }) {
```

- [ ] **Step 2: Add a "Visit costs from records" section inside `BillingTab`, after the existing `Bills` section (before the final closing `</div>`). Insert this block right before the closing `</div>` of the `BillingTab` return:**

```jsx
{/* Real visit costs from API */}
{toothHistory && (toothHistory.totalBilled > 0 || toothHistory.generalVisits?.length > 0) && (
  <>
    <div style={{ height: 20 }} />
    <SectionHeader>Recorded visit costs</SectionHeader>
    <div className="card" style={{ padding: '8px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Total from visits</span>
        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: '#1E8E3E' }}>₹{Math.round(toothHistory.totalBilled).toLocaleString('en-IN')}</span>
      </div>
    </div>
    {toothHistory.toothMap?.filter(t => t.totalCost > 0).map(t => (
      <div key={t.toothNumber} className="card" style={{ padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Tooth {t.toothNumber}</span>
          <span className="t-meta" style={{ display: 'block' }}>{t.completedProcedures?.[0]?.procedure || ''}</span>
        </div>
        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>₹{Math.round(t.totalCost).toLocaleString('en-IN')}</span>
      </div>
    ))}
  </>
)}
```

- [ ] **Step 3: Update the `BillingTab` call in the renderer to pass `toothHistory`:**

Find:
```jsx
{tab === 'Billing' && <BillingTab p={p} bills={bills} prescriptions={prescriptions} labOrders={labOrders} visits={visits} procedures={procedures} openSheet={openSheet} />}
```
Replace with:
```jsx
{tab === 'Billing' && <BillingTab p={p} bills={bills} prescriptions={prescriptions} labOrders={labOrders} visits={visits} procedures={procedures} openSheet={openSheet} toothHistory={toothHistory} />}
```

- [ ] **Step 4: Commit**

```bash
git add dentai-app/app/patients/[id]/PatientProfileClient.jsx
git commit -m "feat: show real API visit costs in BillingTab"
```

---

## Task 8: New-user onboarding flow

**Files:**
- Modify: `dentai-app/app/login/page.jsx`

When `verifyOtp` returns no `clinicId` (new user), add a role-selection step and create-vs-join flow. The `app/roles/page.jsx` stays untouched (handles existing users switching clinics).

- [ ] **Step 1: Add new state variables after the existing `const [verifying, setVerifying]` line in `LoginPage`:**

```js
const [selectedRole, setSelectedRole] = useState('doctor'); // 'doctor' | 'receptionist'
const [joinCode, setJoinCode] = useState('');
const [joinName, setJoinName] = useState('');
const [clinicPreview, setClinicPreview] = useState(null);
const [joinLoading, setJoinLoading] = useState(false);
const [joinError, setJoinError] = useState('');
```

- [ ] **Step 2: Add new imports at the top of the file (alongside existing imports):**

```js
import { lookupClinic, joinClinic, createClinic } from '@/lib/services/auth.service';
```

- [ ] **Step 3: Update the `handleVerifyOtp` function. Find the existing navigation block inside `handleVerifyOtp`:**

```js
// Navigate based on whether clinic is set up
if (!clinicData.id) {
  router.replace('/doctor/setup');
} else if (meData.role === 'receptionist') {
  router.replace('/reception');
} else {
  router.replace('/');
}
```
Replace with:
```js
// Navigate based on whether clinic is set up
if (!clinicData.id) {
  setPhase('role_select');
} else if (meData.role === 'receptionist') {
  router.replace('/reception');
} else {
  router.replace('/');
}
```

- [ ] **Step 4: Add three helper handlers after `handleOtpChange`:**

```js
const handleLookupClinic = async () => {
  if (joinCode.trim().length < 3) { setJoinError('Enter the clinic join code'); return; }
  setJoinLoading(true);
  setJoinError('');
  try {
    const res = await lookupClinic(joinCode.trim().toUpperCase());
    setClinicPreview(res.clinic || res);
  } catch (e) {
    setJoinError(e?.response?.data?.message || 'Clinic not found — check the code');
  } finally {
    setJoinLoading(false);
  }
};

const handleJoinClinic = async () => {
  if (!clinicPreview) { setJoinError('Look up the clinic first'); return; }
  if (!joinName.trim()) { setJoinError('Enter your name'); return; }
  setJoinLoading(true);
  setJoinError('');
  try {
    const res = await joinClinic(joinCode.trim().toUpperCase(), selectedRole, joinName.trim());
    const me = res;
    setAuth({
      token: me.token,
      staffId: me.staff?.id,
      role: me.staff?.role || selectedRole,
      clinicId: me.clinic?.id || null,
      name: me.staff?.name || joinName,
      clinicName: me.clinic?.name || '',
      clinicCity: me.clinic?.city || '',
      joinCode: me.clinic?.join_code || '',
    });
    router.replace(selectedRole === 'receptionist' ? '/reception' : '/');
  } catch (e) {
    setJoinError(e?.response?.data?.message || 'Failed to join. Try again.');
  } finally {
    setJoinLoading(false);
  }
};
```

- [ ] **Step 5: Add the three new phase UI blocks in the JSX return. Find the closing `{phase === 'otp' && ...}` block in the return statement and add these blocks after it:**

```jsx
{phase === 'role_select' && (
  <div style={{ padding: '0 28px' }}>
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>What's your role?</div>
      <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>This sets up your workspace</div>
    </div>
    {[
      { role: 'doctor', label: 'Doctor', sub: "I'm a dentist or specialist" },
      { role: 'receptionist', label: 'Receptionist', sub: 'I manage the front desk' },
    ].map(opt => (
      <button key={opt.role} onClick={() => {
        setSelectedRole(opt.role);
        setPhase(opt.role === 'doctor' ? 'clinic_choice' : 'join_new');
      }} className="card tap" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '18px 16px', marginBottom: 12, textAlign: 'left', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{opt.label}</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
        </div>
        <span style={{ fontSize: 22 }}>{opt.role === 'doctor' ? '🦷' : '📋'}</span>
      </button>
    ))}
  </div>
)}

{phase === 'clinic_choice' && (
  <div style={{ padding: '0 28px' }}>
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Your clinic</div>
      <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>Set up or join a clinic</div>
    </div>
    {[
      { label: 'Create a new clinic', sub: "I'll be the clinic admin", fn: () => router.replace('/doctor/setup') },
      { label: 'Join an existing clinic', sub: 'I have a join code', fn: () => setPhase('join_new') },
    ].map((opt, i) => (
      <button key={i} onClick={opt.fn} className="card tap" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '18px 16px', marginBottom: 12, textAlign: 'left', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{opt.label}</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>›</span>
      </button>
    ))}
    <button onClick={() => setPhase('role_select')} style={{ width: '100%', textAlign: 'center', marginTop: 8, fontSize: 15, color: 'var(--blue)', fontWeight: 500 }}>← Back</button>
  </div>
)}

{phase === 'join_new' && (
  <div style={{ padding: '0 28px' }}>
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Join a clinic</div>
      <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>Ask your clinic admin for the join code</div>
    </div>
    <label style={{ display: 'block', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Your name</div>
      <input value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Dr. / Your full name" style={{ width: '100%', border: 'none', borderBottom: '1.5px solid var(--border)', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 600, padding: '4px 0 8px', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
    </label>
    <label style={{ display: 'block', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Clinic join code</div>
      <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setClinicPreview(null); setJoinError(''); }} placeholder="e.g. DENT-MUM-423" style={{ width: '100%', border: 'none', borderBottom: '1.5px solid var(--border)', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, padding: '4px 0 8px', color: 'var(--text-primary)', fontFamily: 'inherit', letterSpacing: '0.04em' }} />
    </label>
    {clinicPreview && (
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{clinicPreview.name}</div>
        {clinicPreview.city && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{clinicPreview.city}</div>}
      </div>
    )}
    {joinError && <div style={{ color: 'var(--red)', fontSize: 14, marginBottom: 12 }}>{joinError}</div>}
    {!clinicPreview ? (
      <PrimaryButton onClick={handleLookupClinic} style={{ opacity: joinLoading ? 0.5 : 1 }}>
        {joinLoading ? 'Looking up…' : 'Find clinic'}
      </PrimaryButton>
    ) : (
      <PrimaryButton onClick={handleJoinClinic} style={{ opacity: joinLoading ? 0.5 : 1 }}>
        {joinLoading ? 'Joining…' : `Join as ${selectedRole === 'doctor' ? 'Doctor' : 'Receptionist'}`}
      </PrimaryButton>
    )}
    <button onClick={() => { setPhase('role_select'); setClinicPreview(null); setJoinError(''); }} style={{ width: '100%', textAlign: 'center', marginTop: 12, fontSize: 15, color: 'var(--blue)', fontWeight: 500 }}>← Back</button>
  </div>
)}
```

- [ ] **Step 6: Test the new flow manually**

1. Open `http://localhost:3001/login`
2. Enter a phone number that has never registered
3. Enter OTP `123456` (dev OTP)
4. Verify the role selection screen appears
5. Tap "Doctor" → verify clinic choice screen appears
6. Tap "Join existing clinic" → verify join form appears with name + code fields
7. Go back, tap "Receptionist" → verify join form appears directly

- [ ] **Step 7: Commit**

```bash
git add dentai-app/app/login/page.jsx
git commit -m "feat: add role selection and create/join clinic flow for new users"
```

---

## Task 9: AccountSettingsSheet — real data + clinic join code

**Files:**
- Modify: `dentai-app/components/sheets/AccountSettingsSheet.jsx`

- [ ] **Step 1: Replace the entire file with:**

```jsx
'use client';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { SheetHeader, Chip } from '@/components/ui';

export default function AccountSettingsSheet({ onClose }) {
  const name     = useAppStore((s) => s.name);
  const role     = useAppStore((s) => s.role);
  const clinic   = useAppStore((s) => s.clinic);
  const switchRole = useAppStore((s) => s.switchRole);
  const signOut  = useAppStore((s) => s.signOut);

  const clinicName = clinic?.clinicName || '';
  const city = clinic?.city || '';
  const joinCode = clinic?.joinCode || '';

  const handleCopyCode = () => {
    if (joinCode && typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(joinCode).catch(() => {});
    }
  };

  const rows = ['Clinic name', 'Clinic address', 'Working hours', 'Staff accounts', 'Procedures library'];

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={name || 'Account'} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 16 }}>
        <Chip label={role === 'receptionist' ? 'Receptionist' : 'Doctor'} tone="dark" size="lg" />
        {clinicName && <span className="t-meta">{clinicName}{city ? ' · ' + city : ''}</span>}
      </div>

      {joinCode ? (
        <button onClick={handleCopyCode} className="card" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 16px', marginBottom: 16, gap: 12, textAlign: 'left' }}>
          <Icon name="share" size={20} color="var(--blue)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>Clinic join code</div>
            <div className="tnum" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)' }}>{joinCode}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Tap to copy · Share with staff</div>
          </div>
        </button>
      ) : null}

      <button onClick={() => { onClose(); switchRole(); }} className="card rowtap" style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', marginBottom: 16, textAlign: 'left' }}>
        <Icon name="swap" size={20} color="var(--blue)" />
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 600 }}>Switch role</div><div className="t-meta">Try the {role === 'receptionist' ? 'doctor' : 'receptionist'} view</div></div>
        <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
      </button>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {rows.map((r, i) => (
          <button key={r} className="rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', padding: '0 16px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <span style={{ flex: 1, fontSize: 16 }}>{r}</span><Icon name="chevRight" size={16} color="var(--text-tertiary)" />
          </button>
        ))}
      </div>
      <button onClick={() => { onClose(); signOut(); }} className="card rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--red)', fontSize: 16, fontWeight: 500 }}>
        <Icon name="logout" size={18} color="var(--red)" />Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify `share` icon exists (used for the join code copy button)**

```bash
grep -r '"share"' /Users/jayavarsan/Desktop/dentai/dentai-app/components/icons/ 2>/dev/null | head -3
```

If not found, replace `name="share"` with `name="copy"` or `name="link"` — check with:
```bash
ls /Users/jayavarsan/Desktop/dentai/dentai-app/components/icons/
```

- [ ] **Step 3: Test manually**

1. Log in → tap the account circle (top-right of home screen)
2. Verify the sheet shows real name and clinic name from store (not "DentWay" mock)
3. Verify the join code card appears with the real `clinic.joinCode` value
4. Tap the join code card → verify clipboard copy fires (check browser console for errors)

- [ ] **Step 4: Commit**

```bash
git add dentai-app/components/sheets/AccountSettingsSheet.jsx
git commit -m "feat: show real clinic data and join code in account settings"
```

---

## Self-Review Checklist

- [x] Spec §1.1 (completeConsult payload fix) → Task 1
- [x] Spec §1.2 (tooth_number in appointments) → Already in controller, no task needed
- [x] Spec §2 (service functions) → Task 2
- [x] Spec §3 (dashboard recent appointments) → Task 3
- [x] Spec §4 (patient profile API migration + tabs) → Tasks 4, 5, 7
- [x] Spec §4.3 (ToothDetailSheet real data) → Task 6
- [x] Spec §5 (consultation cost wiring) → Task 1 (completeConsult fix covers this)
- [x] Spec §6 (procedure-to-state mapping) → Task 4 (`procedureToState` function)
- [x] Spec §7 (new user onboarding) → Task 8
- [x] Spec §8 (settings real data + join code) → Task 9
