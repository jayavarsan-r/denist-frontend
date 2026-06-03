# DentWay Next.js + Capacitor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the DentWay dental clinic prototype from a single HTML/Babel/CDN file into a production Next.js 15 + Capacitor mobile app deployable to iOS App Store and Google Play Store.

**Architecture:** Next.js App Router with `output: 'export'` for static file generation consumed by Capacitor. All source JSX is ported verbatim — components are copied first, then wired to Zustand stores replacing the `window.* / useApp()` pattern. No visual changes permitted.

**Tech Stack:** Next.js 15, React 19, Zustand, Capacitor 6, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/app`, Plus Jakarta Sans (via next/font)

---

## Reference: Global substitution rules

Every ported file must apply these replacements. They are NOT repeated per task.

| Source pattern | Next.js replacement |
|----------------|---------------------|
| `const app = useApp()` | Import from specific stores: `useAppStore`, `usePatientStore`, etc. |
| `app.patients` | `usePatientStore(s => s.patients)` |
| `app.visits` | `useVisitStore(s => s.visits)` |
| `app.queue` | `useQueueStore(s => s.queue)` |
| `app.procedures` | `useClinicalStore(s => s.procedures)` |
| `app.bills` | `useClinicalStore(s => s.bills)` |
| `app.prescriptions` | `useClinicalStore(s => s.prescriptions)` |
| `app.labOrders` | `useClinicalStore(s => s.labOrders)` |
| `app.clinicAccounts` | `useClinicalStore(s => s.clinicAccounts)` |
| `app.treatmentPlans` | Import `treatmentPlans` from `@/lib/data/procedures` |
| `app.openPatient(id)` | `router.push('/patients/' + id)` |
| `app.openAppointment(id)` | `router.push('/appointments/' + id)` |
| `app.openCheckout(id)` | `router.push('/checkout/' + id)` |
| `app.openLab()` | `router.push('/finance/lab')` |
| `app.goBack()` | `router.back()` |
| `app.setTab('home')` | `router.push('/')` |
| `app.setTab('patients')` | `router.push('/patients')` |
| `app.setTab('schedule')` | `router.push('/schedule')` |
| `app.setTab('finance')` | `router.push('/finance')` |
| `app.setTab('queue')` | `router.push('/reception')` |
| `app.enterConsult()` | `router.push('/consultation')` |
| `app.exitConsult()` | `router.push('/')` |
| `app.goToPatients(focus)` | `router.push('/patients')` + `useUIStore` flag |
| `app.openSheet(name, params)` | `openSheet(name, params)` from `useAppStore` |
| `app.closeSheet()` | `closeSheet()` from `useAppStore` |
| `app.showToast(msg)` | `showToast(msg)` from `useAppStore` |
| `app.density` | `'standard'` (hard-coded) |
| `app.role` | `useAppStore(s => s.role)` |
| `app.consultMode` | `useAppStore(s => s.consultMode)` |
| `app.clinic` | `useAppStore(s => s.clinic)` |
| `app.checkoutsToday` | `useQueueStore(s => s.checkoutsToday)` |
| `app.scheduleView` | `useAppStore(s => s.scheduleView)` |
| `app.setScheduleView` | `useAppStore(s => s.setScheduleView)` |
| `app.patientsFocus` | `useAppStore(s => s.patientsFocus)` |
| `app.clearPatientsFocus()` | `useAppStore(s => s.clearPatientsFocus)()` |
| `DATA.TODAY` | Import `TODAY` from `@/lib/data/patients` |
| `DATA.STAFF` | Import `STAFF` from `@/lib/data/queue` |
| `DATA.CLINIC` | Import `CLINIC` from `@/lib/data/queue` |
| `DATA.CONSULT_OUTCOMES` | Import `CONSULT_OUTCOMES` from `@/lib/data/queue` |
| `DATA.XRAY_TYPES` | Import `XRAY_TYPES` from `@/lib/data/queue` |
| `DATA.SAMPLE_EXTRACTION` | Import `SAMPLE_EXTRACTION` from `@/lib/data/queue` |
| `DATA.NOW_TIME` | Import `NOW_TIME` from `@/lib/data/queue` |
| `DATA.FREQUENT_MEDICINES` | Import `FREQUENT_MEDICINES` from `@/lib/data/patients` |
| `DATA.PROCEDURE_STAGES` | Import `PROCEDURE_STAGES` from `@/lib/data/procedures` |
| `DATA.PROCEDURE_TYPES` | Import `PROCEDURE_TYPES` from `@/lib/data/procedures` |
| `formatCurrency(...)` | Import from `@/lib/data/utils` |
| `formatCurrencyK(...)` | Import from `@/lib/data/utils` |
| `formatDate(...)` | Import from `@/lib/data/utils` |
| `formatDateLong(...)` | Import from `@/lib/data/utils` |
| `formatTime(...)` | Import from `@/lib/data/utils` |
| `getInitials(...)` | Import from `@/lib/data/utils` |
| `calculateAge(...)` | Import from `@/lib/data/utils` |
| `clinicianFlags(...)` | Import from `@/lib/data/utils` |
| `hasComplications(...)` | Import from `@/lib/data/utils` |
| `parseDate(...)` | Import from `@/lib/data/utils` |
| `getProcedureColor(...)` | Import from `@/lib/data/procedures` |
| `PROC_COLORS` | Import from `@/lib/data/procedures` |
| `minutesAgo(...)` | Import from `@/lib/data/queue` |
| `waitLabel(...)` | Import from `@/lib/data/queue` |
| `QUEUE_STATUS` | Import from `@/lib/data/queue` |
| `mealSlots(...)` | Import from `@/lib/data/queue` |
| `MONTHS`, `DAYS`, `DAYS_FULL` | Import from `@/lib/data/utils` |
| `Object.assign(window, {...})` | Delete this line entirely |
| `window.XYZ = ...` | Delete entirely |

---

## File Map

```
dentai-app/                         ← new Next.js project root
├── next.config.js
├── capacitor.config.json
├── package.json
├── jsconfig.json
├── app/
│   ├── layout.jsx                  ← RootLayout, FlowGuard, SheetHost, BottomNav, Toast
│   ├── globals.css                 ← verbatim copy from project/globals.css
│   ├── page.jsx                    ← HomeScreen
│   ├── onboarding/page.jsx
│   ├── roles/page.jsx
│   ├── doctor/setup/page.jsx
│   ├── reception/page.jsx
│   ├── schedule/page.jsx
│   ├── patients/
│   │   ├── page.jsx
│   │   └── [id]/page.jsx
│   ├── consultation/page.jsx
│   ├── appointments/[id]/page.jsx
│   ├── checkout/[id]/page.jsx
│   └── finance/
│       ├── page.jsx
│       └── lab/page.jsx
├── components/
│   ├── ui/                         ← all primitives from components.jsx
│   │   ├── Avatar.jsx
│   │   ├── Chip.jsx
│   │   ├── StatusChip.jsx
│   │   ├── SectionHeader.jsx
│   │   ├── ToothChip.jsx
│   │   ├── StageDots.jsx
│   │   ├── PillToggle.jsx
│   │   ├── BottomNav.jsx
│   │   ├── BottomSheet.jsx
│   │   ├── Toast.jsx
│   │   ├── PrimaryButton.jsx
│   │   ├── SheetHeader.jsx
│   │   └── index.js                ← re-exports all of the above
│   ├── icons/index.jsx             ← Icon component from icons.jsx
│   ├── odontogram/Odontogram.jsx   ← from odontogram.jsx
│   ├── sheets/
│   │   ├── VoiceSheet.jsx
│   │   ├── AccountSettingsSheet.jsx
│   │   ├── WalkInSheet.jsx
│   │   ├── NewPatientSheet.jsx
│   │   ├── FilterSheet.jsx
│   │   ├── ProcedureDetailSheet.jsx
│   │   ├── ToothDetailSheet.jsx
│   │   ├── NewVisitSheet.jsx
│   │   ├── EditPatientSheet.jsx
│   │   ├── ApptPeekSheet.jsx
│   │   ├── EndVisitSheet.jsx
│   │   ├── CheckInSheet.jsx
│   │   ├── RemoveQueueSheet.jsx
│   │   ├── RecordDiagnosisSheet.jsx
│   │   ├── QueueActionsSheet.jsx
│   │   ├── BillSheet.jsx
│   │   ├── PrescriptionSheet.jsx
│   │   ├── NewLabSheet.jsx
│   │   ├── LabDetailSheet.jsx
│   │   └── AddEntrySheet.jsx
│   ├── SheetHost.jsx
│   └── FlowGuard.jsx
├── store/
│   ├── useAppStore.js
│   ├── usePatientStore.js
│   ├── useVisitStore.js
│   ├── useQueueStore.js
│   └── useClinicalStore.js
└── lib/
    └── data/
        ├── patients.js
        ├── queue.js
        ├── procedures.js
        ├── visits.js
        ├── bills.js
        ├── lab.js
        ├── prescriptions.js
        ├── accounts.js
        └── utils.js
```

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `dentai-app/` (new directory)
- Create: `dentai-app/package.json`
- Create: `dentai-app/next.config.js`
- Create: `dentai-app/jsconfig.json`
- Create: `dentai-app/capacitor.config.json`

- [ ] **Step 1.1: Create Next.js app**

Run from `/Users/jayavarsan/Desktop/dentai/`:
```bash
npx create-next-app@latest dentai-app --no-typescript --no-tailwind --no-eslint --no-src-dir --app --import-alias "@/*"
```
When prompted: answer Yes to App Router, No to everything else.

- [ ] **Step 1.2: Replace next.config.js**

```js
// dentai-app/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 1.3: Replace jsconfig.json**

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 1.4: Install dependencies**

```bash
cd dentai-app
npm install zustand
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm install @capacitor/status-bar @capacitor/splash-screen @capacitor/app
```

- [ ] **Step 1.5: Create capacitor.config.json**

```json
{
  "appId": "com.dentway.app",
  "appName": "DentWay",
  "webDir": "out",
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 1500,
      "backgroundColor": "#F2F2F7"
    },
    "StatusBar": {
      "style": "Dark",
      "backgroundColor": "#F2F2F7"
    }
  }
}
```

- [ ] **Step 1.6: Add scripts to package.json**

Open `dentai-app/package.json` and add to the `scripts` block:
```json
"build:mobile": "next build && npx cap sync",
"open:ios": "npx cap open ios",
"open:android": "npx cap open android"
```

- [ ] **Step 1.7: Verify Next.js dev server starts**

```bash
cd dentai-app && npm run dev
```
Expected: Server starts at http://localhost:3000 with no errors.

- [ ] **Step 1.8: Commit**

```bash
cd dentai-app
git add .
git commit -m "chore: scaffold Next.js 15 project with Capacitor config"
```

---

## Task 2: Data layer — ES modules

**Files:**
- Create: `dentai-app/lib/data/patients.js`
- Create: `dentai-app/lib/data/procedures.js`
- Create: `dentai-app/lib/data/visits.js`
- Create: `dentai-app/lib/data/bills.js`
- Create: `dentai-app/lib/data/prescriptions.js`
- Create: `dentai-app/lib/data/accounts.js`
- Create: `dentai-app/lib/data/queue.js`
- Create: `dentai-app/lib/data/utils.js`

- [ ] **Step 2.1: Create lib/data/utils.js**

Copy the utility functions from `project/data.js` lines 182–230 (everything after `window.DATA = {`), remove all `window.*` assignments, and export named:

```js
// dentai-app/lib/data/utils.js

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DAYS_FULL = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

export function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
export function formatDate(s) { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function formatDateLong(s) { const d = parseDate(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function formatTime(t) {
  let [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, m, ampm, label: `${h12}:${String(m).padStart(2,'0')} ${ampm}` };
}
export function formatCurrency(n) {
  const v = Math.round(n || 0);
  return '₹' + v.toLocaleString('en-IN');
}
export function formatCurrencyK(n) {
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + n;
}
export function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
export function calculateAge(dob) {
  const TODAY = '2026-06-02';
  const d = new Date(dob); const now = new Date(TODAY);
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
export function clinicianFlags(p) {
  const f = [];
  if (p.hasDiabetes) f.push('Diabetic');
  if (p.hasHypertension) f.push('Hypertensive');
  if (p.hasHeartCondition) f.push('Heart condition');
  if (p.isPregnant) f.push('Pregnant');
  if (p.isOnBloodThinners) f.push('Blood thinners');
  (p.allergies || []).forEach(a => f.push(a + ' allergy'));
  return f;
}
export function hasComplications(p) { return clinicianFlags(p).length > 0; }
```

- [ ] **Step 2.2: Create lib/data/patients.js**

Copy the `patients` array and constants from `project/data.js` lines 1–75, removing all `window.*` assignments:

```js
// dentai-app/lib/data/patients.js

export const TODAY = '2026-06-02';

export const FREQUENT_MEDICINES = [
  "Amoxicillin 500mg", "Ibuprofen 400mg", "Paracetamol 500mg", "Metronidazole 400mg",
  "Clindamycin 300mg", "Diclofenac 50mg", "Pantoprazole 40mg", "Cetirizine 10mg",
  "Tramadol 50mg", "Chlorhexidine Mouthwash",
];

export const patients = [
  {
    id: 'p1', name: 'Ramesh Kumar', phone: '+91 98401 22314', age: 42, gender: 'Male',
    bloodGroup: 'O+', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [],
    clinicalNotes: 'Sensitive to cold on lower left. Advised soft diet during RCT.',
    chiefComplaint: 'Sharp pain in lower left back tooth, worse at night.',
    status: 'current', createdAt: '2026-04-18',
    teeth: { 36: 'rct', 37: 'filling', 16: 'crown', 46: 'healthy' },
  },
  {
    id: 'p2', name: 'Meena Rajan', phone: '+91 99620 88107', age: 56, gender: 'Female',
    bloodGroup: 'B+', hasDiabetes: true, hasHypertension: true, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: ['Penicillin'],
    currentMedications: ['Metformin 500mg', 'Amlodipine 5mg'],
    clinicalNotes: 'Diabetic — monitor healing. Avoid penicillin-class antibiotics.',
    chiefComplaint: 'Bleeding gums while brushing for past 3 weeks.',
    status: 'current', createdAt: '2026-03-02',
    teeth: { 24: 'infection', 25: 'scheduled', 11: 'healthy' },
  },
  {
    id: 'p3', name: 'Priya Sundaram', phone: '+91 90031 45562', age: 29, gender: 'Female',
    bloodGroup: 'A+', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [],
    clinicalNotes: '', chiefComplaint: 'Routine check-up and cleaning.',
    status: 'new', createdAt: '2026-06-02',
    teeth: {},
  },
  {
    id: 'p4', name: 'Anand Krishnan', phone: '+91 98847 30019', age: 61, gender: 'Male',
    bloodGroup: 'AB+', hasDiabetes: true, hasHypertension: false, hasHeartCondition: false,
    isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: ['Metformin 1000mg'],
    clinicalNotes: 'Full mouth rehab in progress. Diabetic — staged approach.',
    chiefComplaint: 'Multiple worn and missing teeth, difficulty chewing.',
    status: 'current', createdAt: '2026-02-11',
    teeth: { 14: 'crown', 46: 'scheduled', 26: 'rct', 38: 'extraction', 13: 'healthy' },
  },
];
```

- [ ] **Step 2.3: Create lib/data/procedures.js**

Copy the procedures constants and arrays from `project/data.js` lines 9–121:

```js
// dentai-app/lib/data/procedures.js

export const PROCEDURE_STAGES = {
  RCT: ["Diagnosis & X-ray", "Access Opening", "Cleaning & Shaping", "Medication & Temporary", "Obturation", "Crown Recommendation"],
  Implant: ["Consultation & Planning", "Implant Placement", "Osseointegration", "Abutment Placement", "Crown Placement"],
  Scaling: ["Full Mouth Scaling", "Polish"],
  Extraction: ["Anesthesia & Extraction", "Socket Inspection"],
  Crown: ["Tooth Preparation", "Impression", "Temporary Crown", "Fitting & Cementation"],
};

export const PROCEDURE_TYPES = ["RCT", "Extraction", "Scaling", "Crown", "Implant", "Filling", "Orthodontics"];

export const PROC_COLORS = {
  RCT:        { bg: '#EEF2FF', border: '#6366F1', dot: '#6366F1' },
  Extraction: { bg: '#FFF1F2', border: '#FF3B30', dot: '#FF3B30' },
  Scaling:    { bg: '#F0FDF4', border: '#34C759', dot: '#34C759' },
  Crown:      { bg: '#FAF5FF', border: '#BF5AF2', dot: '#BF5AF2' },
  Implant:    { bg: '#F0FDFA', border: '#32ADE6', dot: '#32ADE6' },
  Filling:    { bg: '#EFF6FF', border: '#007AFF', dot: '#007AFF' },
  Other:      { bg: '#F9FAFB', border: '#6E6E73', dot: '#6E6E73' },
};

export function getProcedureColor(type) { return PROC_COLORS[type] || PROC_COLORS.Other; }

function stages(type, doneCount) {
  return PROCEDURE_STAGES[type].map((name, i) => ({
    name, completed: i < doneCount, date: null, notes: '',
  }));
}

export const procedures = [
  { id: 'proc_rct36', treatmentPlanId: 'tp1', patientId: 'p1', type: 'RCT', tooth: 36, status: 'in_progress', currentStage: 'Cleaning & Shaping', stages: stages('RCT', 2), estimatedVisits: 4, completedVisits: 2, estimatedCost: 6000, actualCost: 3000, labOrderId: null, startedAt: '2026-04-18', completedAt: null },
  { id: 'proc_crown36', treatmentPlanId: 'tp1', patientId: 'p1', type: 'Crown', tooth: 36, status: 'planned', currentStage: 'Tooth Preparation', stages: stages('Crown', 0), estimatedVisits: 2, completedVisits: 0, estimatedCost: 5000, actualCost: 0, labOrderId: 'lab1', startedAt: '', completedAt: null },
  { id: 'proc_scaling', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Scaling', tooth: null, status: 'completed', currentStage: 'Polish', stages: stages('Scaling', 2), estimatedVisits: 1, completedVisits: 1, estimatedCost: 2000, actualCost: 2000, labOrderId: null, startedAt: '2026-05-12', completedAt: '2026-05-12' },
  { id: 'proc_crown14', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Crown', tooth: 14, status: 'in_progress', currentStage: 'Impression', stages: stages('Crown', 2), estimatedVisits: 3, completedVisits: 1, estimatedCost: 6000, actualCost: 2000, labOrderId: 'lab2', startedAt: '2026-05-20', completedAt: null },
  { id: 'proc_implant46', treatmentPlanId: 'tp2', patientId: 'p4', type: 'Implant', tooth: 46, status: 'planned', currentStage: 'Consultation & Planning', stages: stages('Implant', 0), estimatedVisits: 5, completedVisits: 0, estimatedCost: 35000, actualCost: 0, labOrderId: null, startedAt: '', completedAt: null },
];

export const treatmentPlans = [
  { id: 'tp1', patientId: 'p1', title: 'RCT + Crown · Tooth 36', procedures: ['proc_rct36', 'proc_crown36'], totalEstimatedCost: 11000, createdAt: '2026-04-18', status: 'active' },
  { id: 'tp2', patientId: 'p4', title: 'Full Mouth Rehabilitation', procedures: ['proc_scaling', 'proc_crown14', 'proc_implant46'], totalEstimatedCost: 43000, createdAt: '2026-02-11', status: 'active' },
];
```

- [ ] **Step 2.4: Create lib/data/visits.js**

```js
// dentai-app/lib/data/visits.js

export const visits = [
  { id: 'v1', patientId: 'p1', procedureId: 'proc_rct36', date: '2026-06-02', startTime: '09:30', durationMinutes: 45, status: 'arrived', visitNumber: 2, totalVisits: 4, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v2', patientId: 'p2', procedureId: null, date: '2026-06-02', startTime: '10:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v3', patientId: 'p4', procedureId: 'proc_crown14', date: '2026-06-02', startTime: '11:30', durationMinutes: 60, status: 'confirmed', visitNumber: 2, totalVisits: 3, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v4', patientId: 'p3', procedureId: null, date: '2026-06-02', startTime: '16:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v5', patientId: 'p1', procedureId: 'proc_rct36', date: '2026-05-26', startTime: '10:00', durationMinutes: 45, status: 'done', visitNumber: 1, totalVisits: 4, clinicalNotes: 'Access opening done. Pulp extirpated, working length established on mesial canals.', proceduresDone: 'Access opening, pulp extirpation', nextSteps: 'Cleaning & shaping next visit. Continue ibuprofen if tender.', medications: ['Ibuprofen 400mg'] },
  { id: 'v6', patientId: 'p4', procedureId: 'proc_scaling', date: '2026-06-03', startTime: '09:00', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v7', patientId: 'p2', procedureId: null, date: '2026-06-03', startTime: '14:00', durationMinutes: 45, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v8', patientId: 'p1', procedureId: 'proc_crown36', date: '2026-06-05', startTime: '11:00', durationMinutes: 60, status: 'confirmed', visitNumber: 1, totalVisits: 2, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
  { id: 'v9', patientId: 'p3', procedureId: null, date: '2026-06-04', startTime: '15:30', durationMinutes: 30, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] },
];
```

- [ ] **Step 2.5: Create lib/data/bills.js**

```js
// dentai-app/lib/data/bills.js

export const bills = [
  { id: 'bill1', patientId: 'p1', patientName: 'Ramesh Kumar', items: [
      { description: 'RCT — Tooth 36 (in progress)', quantity: 1, unitPrice: 6000, total: 6000 },
      { description: 'Digital X-ray (IOPA)', quantity: 1, unitPrice: 300, total: 300 },
    ], subtotal: 6300, discount: 300, total: 6000, paid: 3000, outstanding: 3000, createdAt: '2026-05-26', status: 'partial' },
  { id: 'bill2', patientId: 'p4', patientName: 'Anand Krishnan', items: [
      { description: 'Full mouth scaling & polish', quantity: 1, unitPrice: 2000, total: 2000 },
      { description: 'Consultation', quantity: 1, unitPrice: 500, total: 500 },
    ], subtotal: 2500, discount: 0, total: 2500, paid: 2500, outstanding: 0, createdAt: '2026-05-12', status: 'paid' },
];
```

- [ ] **Step 2.6: Create lib/data/lab.js**

```js
// dentai-app/lib/data/lab.js

export const labOrders = [
  { id: 'lab1', patientId: 'p1', patientName: 'Ramesh Kumar', procedureId: 'proc_crown36', procedureType: 'Crown', toothNumber: 36, labName: 'City Dental Lab', workDescription: 'PFM crown, tooth 36', sentDate: '2026-05-26', expectedReturnDate: '2026-06-02', actualReturnDate: '2026-06-01', status: 'received', costToClinic: 2500, chargedToPatient: 5000, notes: 'Standard PFM.', shade: 'A2', impressionType: 'Digital scan' },
  { id: 'lab2', patientId: 'p4', patientName: 'Anand Krishnan', procedureId: 'proc_crown14', procedureType: 'Crown', toothNumber: 14, labName: 'Precise Dental Lab', workDescription: 'Zirconia crown, tooth 14', sentDate: '2026-05-28', expectedReturnDate: '2026-06-06', actualReturnDate: null, status: 'sent', costToClinic: 3000, chargedToPatient: 6000, notes: '', shade: 'A1', impressionType: 'PVS impression' },
];
```

- [ ] **Step 2.7: Create lib/data/prescriptions.js**

```js
// dentai-app/lib/data/prescriptions.js

export const prescriptions = [
  { id: 'rx1', patientId: 'p1', patientName: 'Ramesh Kumar', date: '2026-05-26', medicines: [
      { name: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: 'BD', duration: '3 days', notes: 'After food' },
      { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: 'TDS', duration: '5 days', notes: '' },
    ], instructions: 'Take after meals. Avoid chewing on the treated side.', followUpDays: 7 },
  { id: 'rx2', patientId: 'p4', patientName: 'Anand Krishnan', date: '2026-05-12', medicines: [
      { name: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'BD', duration: '7 days', notes: 'Rinse for 30s' },
      { name: 'Paracetamol 500mg', dosage: '1 tablet', frequency: 'SOS', duration: '3 days', notes: 'If pain' },
    ], instructions: 'Warm saline rinses twice daily. Maintain blood sugar control.', followUpDays: 14 },
];
```

- [ ] **Step 2.8: Create lib/data/accounts.js**

```js
// dentai-app/lib/data/accounts.js

export const clinicAccounts = [
  { id: 'a1', date: '2026-06-02', type: 'income', category: 'Treatment', description: 'Ramesh Kumar — RCT part payment', amount: 3000, patientId: 'p1', labOrderId: null },
  { id: 'a2', date: '2026-06-01', type: 'expense', category: 'Lab', description: 'City Dental Lab — crown T36', amount: 2500, patientId: 'p1', labOrderId: 'lab1' },
  { id: 'a3', date: '2026-05-30', type: 'income', category: 'Treatment', description: 'Walk-in extraction — cash', amount: 1500, patientId: null, labOrderId: null },
  { id: 'a4', date: '2026-05-28', type: 'expense', category: 'Lab', description: 'Precise Dental Lab — crown T14', amount: 3000, patientId: 'p4', labOrderId: 'lab2' },
  { id: 'a5', date: '2026-05-26', type: 'income', category: 'Treatment', description: 'Ramesh Kumar — X-ray + access', amount: 3300, patientId: 'p1', labOrderId: null },
  { id: 'a6', date: '2026-05-24', type: 'expense', category: 'Supplies', description: 'Composite & burs restock', amount: 4200, patientId: null, labOrderId: null },
  { id: 'a7', date: '2026-05-20', type: 'income', category: 'Treatment', description: 'Crown impression — Anand', amount: 2000, patientId: 'p4', labOrderId: null },
  { id: 'a8', date: '2026-05-15', type: 'expense', category: 'Rent', description: 'Clinic rent — May', amount: 28000, patientId: null, labOrderId: null },
  { id: 'a9', date: '2026-05-12', type: 'income', category: 'Treatment', description: 'Anand Krishnan — scaling & polish', amount: 2500, patientId: 'p4', labOrderId: null },
  { id: 'a10', date: '2026-05-10', type: 'income', category: 'Treatment', description: 'Priya Sundaram — consultation', amount: 500, patientId: 'p3', labOrderId: null },
];
```

- [ ] **Step 2.9: Create lib/data/queue.js**

Copy the entire content of `project/data_queue.js`, remove all `window.*` assignments, and export everything named:

```js
// dentai-app/lib/data/queue.js

export const NOW_TIME = '09:42';

export const STAFF = {
  doctor:       { id: 's1', name: 'Dr. Arjun Mehta', role: 'doctor', initials: 'AM' },
  receptionist: { id: 's2', name: 'Lakshmi Iyer',   role: 'receptionist', initials: 'LI' },
};
export const CLINIC = { name: 'Mehta Dental Care', city: 'Chennai', joinCode: 'MDC-204' };

export const CONSULT_OUTCOMES = [
  { id: 'treatment_done', label: 'Treatment done', tone: 'green' },
  { id: 'treatment_postponed', label: 'Postponed', tone: 'amber' },
  { id: 'diagnosis_only', label: 'Diagnosis only', tone: 'teal' },
  { id: 'follow_up_scheduled', label: 'Follow-up', tone: 'teal' },
  { id: 'additional_sitting_required', label: 'More sittings', tone: 'amber' },
  { id: 'referred', label: 'Referred out', tone: 'purple' },
];

export const XRAY_TYPES = ['OPG', 'RVG', 'CBCT', 'Photo', 'Referral'];

export function mealSlots(b, l, d) { return { breakfast: b, lunch: l, dinner: d }; }

export const queueEntries = [
  { id: 'q1', patientId: 'p1', tokenNumber: 1, status: 'in_consultation', chiefComplaint: 'Sharp pain in lower left back tooth, worse at night.', priority: 'normal', checkedInAt: '09:12', calledInAt: '09:30', readyAt: null, assignedDoctor: 's1', xrays: [{ type: 'RVG', tooth: 36 }], outcome: null, consult: null, transcript: '' },
  { id: 'q2', patientId: 'p2', tokenNumber: 2, status: 'ready_for_checkout', chiefComplaint: 'Bleeding gums while brushing for the past 3 weeks.', priority: 'normal', checkedInAt: '09:05', calledInAt: '09:14', readyAt: '09:34', assignedDoctor: 's1', xrays: [], outcome: 'treatment_done',
    transcript: 'Generalised gingivitis with heavy calculus. Did full mouth scaling today, one more sitting needed next visit. Diabetic so monitor healing. Chlorhexidine mouthwash twice daily for seven days, and paracetamol if sore.',
    consult: { diagnosis: 'Generalised gingivitis with sub-gingival calculus', procedure: 'Scaling', tooth: null, totalSittings: 2, sittingDone: 1, estimatedCost: 2000,
      medicines: [
        { name: 'Chlorhexidine Mouthwash', dose: '10 ml', frequency: 'Twice daily', duration: '7 days', timing: 'After meals', instructions: 'Rinse for 30 seconds, do not swallow.', slots: mealSlots(true, false, true) },
        { name: 'Paracetamol', dose: '500 mg', frequency: 'As needed', duration: '3 days', timing: 'After meals', instructions: 'Take only if gums feel sore.', slots: mealSlots(false, false, false) },
      ],
      instructions: 'Warm saline rinses twice daily. Avoid very hot or spicy food for 2 days. Keep blood sugar in check for faster healing.',
      followUp: 'Review after 2 weeks for second scaling sitting.',
      appointments: [{ session: 2, date: '2026-06-16', time: '10:00', purpose: 'Scaling — Session 2' }],
    },
  },
  { id: 'q3', patientId: 'p3', tokenNumber: 3, status: 'waiting', chiefComplaint: 'Routine check-up and cleaning.', priority: 'normal', checkedInAt: '09:21', calledInAt: null, readyAt: null, assignedDoctor: 's1', xrays: [], outcome: null, consult: null, transcript: '' },
  { id: 'q4', patientId: 'p4', tokenNumber: 4, status: 'waiting', chiefComplaint: 'Crown feels loose on upper right, difficulty chewing.', priority: 'urgent', checkedInAt: '09:38', calledInAt: null, readyAt: null, assignedDoctor: 's1', xrays: [{ type: 'OPG' }], outcome: null, consult: null, transcript: '' },
];

export const checkoutsToday = [
  { patientName: 'Suresh Babu', procedure: 'Extraction · Tooth 48', amount: 1500, time: '08:55' },
];

export const SAMPLE_EXTRACTION = {
  diagnosis: 'Irreversible pulpitis, tooth 36',
  procedure: 'RCT', tooth: 36, totalSittings: 4, estimatedCost: 6000,
  medicines: [
    { name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', duration: '5 days', timing: 'After meals', instructions: 'Complete the full course even if pain settles.', slots: mealSlots(true, true, true) },
    { name: 'Ibuprofen', dose: '400 mg', frequency: 'Twice daily', duration: '3 days', timing: 'After meals', instructions: 'Take with food. Avoid on empty stomach.', slots: mealSlots(true, false, true), uncertain: true },
  ],
  instructions: 'Avoid chewing on the treated side. Warm saline rinses from tomorrow.',
  followUp: 'Cleaning & shaping at next visit.',
  appointments: [
    { session: 2, date: '2026-06-09', time: '10:00', purpose: 'RCT — Session 2' },
    { session: 3, date: '2026-06-16', time: '10:00', purpose: 'RCT — Session 3' },
    { session: 4, date: '2026-06-23', time: '10:00', purpose: 'RCT — Session 4' },
  ],
};

export function minutesAgo(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [nh, nm] = NOW_TIME.split(':').map(Number);
  return Math.max(0, (nh * 60 + nm) - (h * 60 + m));
}
export function waitLabel(hhmm) {
  const min = minutesAgo(hhmm);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}
export const QUEUE_STATUS = {
  waiting:            { label: 'Waiting', tone: 'neutral' },
  in_consultation:    { label: 'In consult', tone: 'amber' },
  ready_for_checkout: { label: 'Ready for checkout', tone: 'teal' },
  checked_out:        { label: 'Checked out', tone: 'green' },
};
```

- [ ] **Step 2.10: Commit data layer**

```bash
git add lib/
git commit -m "feat: add ES module data layer (patients, procedures, visits, bills, lab, queue, utils)"
```

---

## Task 3: Zustand stores

**Files:**
- Create: `dentai-app/store/useAppStore.js`
- Create: `dentai-app/store/usePatientStore.js`
- Create: `dentai-app/store/useVisitStore.js`
- Create: `dentai-app/store/useQueueStore.js`
- Create: `dentai-app/store/useClinicalStore.js`

- [ ] **Step 3.1: Create store/useAppStore.js**

```js
// dentai-app/store/useAppStore.js
import { create } from 'zustand';
import { CLINIC, STAFF } from '@/lib/data/queue';

export const useAppStore = create((set, get) => ({
  started: false,
  role: null,
  consultMode: false,
  doctorSetupDone: false,
  patientsFocus: false,
  scheduleView: 'Week',
  toast: '',
  activeSheet: null,
  clinic: {
    doctorName: STAFF.doctor.name,
    specialty: 'General Dentistry',
    clinicName: CLINIC.name,
    city: CLINIC.city,
    address: '',
    days: [1, 2, 3, 4, 5, 6],
    open: '09:00',
    close: '18:00',
    slot: 30,
  },
  _toastTimer: null,

  setStarted: (v) => set({ started: v }),
  pickRole: (r) => set({ role: r, consultMode: false }),
  switchRole: () => set({ role: null, consultMode: false }),
  signOut: () => set({ started: false, role: null, consultMode: false, doctorSetupDone: false }),
  saveClinic: (c) => set({ clinic: c, doctorSetupDone: true }),
  enterConsult: () => set({ consultMode: true }),
  exitConsult: () => set({ consultMode: false }),

  openSheet: (name, params = {}) => set({ activeSheet: { name, params } }),
  closeSheet: () => set({ activeSheet: null }),

  showToast: (msg) => {
    const t = get()._toastTimer;
    if (t) clearTimeout(t);
    const timer = setTimeout(() => set({ toast: '' }), 2400);
    set({ toast: msg, _toastTimer: timer });
  },

  setScheduleView: (v) => set({ scheduleView: v }),
  setPatientsFocus: (v) => set({ patientsFocus: v }),
  clearPatientsFocus: () => set({ patientsFocus: false }),
}));
```

- [ ] **Step 3.2: Create store/usePatientStore.js**

```js
// dentai-app/store/usePatientStore.js
import { create } from 'zustand';
import { patients as seedPatients } from '@/lib/data/patients';

export const usePatientStore = create((set) => ({
  patients: seedPatients,

  addPatient: (p) => set((s) => ({ patients: [p, ...s.patients] })),

  updatePatient: (id, patch) =>
    set((s) => ({ patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  updateToothState: (pid, tooth, state) =>
    set((s) => ({
      patients: s.patients.map((p) =>
        p.id === pid ? { ...p, teeth: { ...p.teeth, [tooth]: state } } : p
      ),
    })),
}));
```

- [ ] **Step 3.3: Create store/useVisitStore.js**

```js
// dentai-app/store/useVisitStore.js
import { create } from 'zustand';
import { visits as seedVisits } from '@/lib/data/visits';

export const useVisitStore = create((set) => ({
  visits: seedVisits,

  addVisit: (v) => set((s) => ({ visits: [...s.visits, v] })),

  updateVisit: (id, patch) =>
    set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),

  moveVisit: (id, date, startTime) =>
    set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, date, startTime } : v)) })),
}));
```

- [ ] **Step 3.4: Create store/useQueueStore.js**

```js
// dentai-app/store/useQueueStore.js
import { create } from 'zustand';
import { queueEntries as seedQueue, checkoutsToday as seedCheckouts, NOW_TIME } from '@/lib/data/queue';
import { TODAY } from '@/lib/data/patients';

export const useQueueStore = create((set, get) => ({
  queue: seedQueue,
  checkoutsToday: seedCheckouts,

  callIn: (id) =>
    set((s) => {
      if (s.queue.some((e) => e.status === 'in_consultation')) return s;
      return { queue: s.queue.map((e) => e.id === id ? { ...e, status: 'in_consultation', calledInAt: NOW_TIME } : e) };
    }),

  completeConsult: (id, consult) =>
    set((s) => {
      let next = s.queue.map((e) =>
        e.id === id ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: NOW_TIME, consult } : e
      );
      const waiting = next.filter((e) => e.status === 'waiting').sort((a, b) => a.tokenNumber - b.tokenNumber);
      if (waiting[0]) {
        next = next.map((e) => e.id === waiting[0].id ? { ...e, status: 'in_consultation', calledInAt: NOW_TIME } : e);
      }
      return { queue: next };
    }),

  checkout: (id, summary) =>
    set((s) => ({
      queue: s.queue.map((e) => (e.id === id ? { ...e, status: 'checked_out' } : e)),
      checkoutsToday: [{ ...summary, time: NOW_TIME }, ...s.checkoutsToday],
    })),

  addToQueue: ({ patientId, chiefComplaint, priority, xrays }) =>
    set((s) => ({
      queue: [
        ...s.queue,
        {
          id: 'q' + Date.now(),
          patientId,
          tokenNumber: Math.max(0, ...s.queue.map((e) => e.tokenNumber)) + 1,
          status: 'waiting',
          chiefComplaint,
          priority: priority || 'normal',
          checkedInAt: NOW_TIME,
          calledInAt: null,
          readyAt: null,
          assignedDoctor: 's1',
          xrays: xrays || [],
          outcome: null,
          consult: null,
          transcript: '',
        },
      ],
    })),

  removeFromQueue: (id) =>
    set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),

  showToastOnBusy: null,
}));
```

- [ ] **Step 3.5: Create store/useClinicalStore.js**

```js
// dentai-app/store/useClinicalStore.js
import { create } from 'zustand';
import { procedures as seedProcedures } from '@/lib/data/procedures';
import { labOrders as seedLab } from '@/lib/data/lab';
import { bills as seedBills } from '@/lib/data/bills';
import { prescriptions as seedRx } from '@/lib/data/prescriptions';
import { clinicAccounts as seedAccounts } from '@/lib/data/accounts';
import { TODAY } from '@/lib/data/patients';

export const useClinicalStore = create((set) => ({
  procedures: seedProcedures,
  labOrders: seedLab,
  bills: seedBills,
  prescriptions: seedRx,
  clinicAccounts: seedAccounts,

  advanceProcedure: (id) =>
    set((s) => ({
      procedures: s.procedures.map((pr) => {
        if (pr.id !== id) return pr;
        const idx = pr.stages.findIndex((st) => !st.completed);
        const stages = pr.stages.map((st, i) => i === idx ? { ...st, completed: true, date: TODAY } : st);
        const completedVisits = Math.min(pr.estimatedVisits, pr.completedVisits + 1);
        const allDone = stages.every((st) => st.completed);
        return { ...pr, stages, completedVisits, currentStage: (stages.find((st) => !st.completed) || stages[stages.length - 1]).name, status: allDone ? 'completed' : 'in_progress' };
      }),
    })),

  markLabReceived: (id) =>
    set((s) => ({
      labOrders: s.labOrders.map((l) => l.id === id ? { ...l, status: 'received', actualReturnDate: TODAY } : l),
    })),

  addLabOrder: (l) => set((s) => ({ labOrders: [l, ...s.labOrders] })),

  saveBill: (b) =>
    set((s) => ({
      bills: s.bills.some((x) => x.id === b.id) ? s.bills.map((x) => (x.id === b.id ? b : x)) : [b, ...s.bills],
    })),

  saveRx: (r) =>
    set((s) => ({
      prescriptions: s.prescriptions.some((x) => x.id === r.id) ? s.prescriptions.map((x) => (x.id === r.id ? r : x)) : [r, ...s.prescriptions],
    })),

  addAccount: (a) => set((s) => ({ clinicAccounts: [a, ...s.clinicAccounts] })),
}));
```

- [ ] **Step 3.6: Commit stores**

```bash
git add store/
git commit -m "feat: add Zustand stores (app, patient, visit, queue, clinical)"
```

---

## Task 4: CSS, global assets, and layout shell

**Files:**
- Create: `dentai-app/app/globals.css`
- Modify: `dentai-app/app/layout.jsx`

- [ ] **Step 4.1: Copy globals.css**

Copy `project/globals.css` verbatim to `dentai-app/app/globals.css`.

Then make two permitted changes:

1. Remove the `@import url('https://fonts.googleapis.com/...')` line at the top (font loaded via next/font instead).

2. At the very end of the file, append:
```css
/* safe-area support for Capacitor */
.safe-top { padding-top: env(safe-area-inset-top, 0px); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

- [ ] **Step 4.2: Write app/layout.jsx**

```jsx
'use client';

import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import FlowGuard from '@/components/FlowGuard';
import SheetHost from '@/components/SheetHost';
import BottomNav from '@/components/ui/BottomNav';
import Toast from '@/components/ui/Toast';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jakarta',
});

const HIDE_NAV_PATHS = [
  '/onboarding',
  '/roles',
  '/doctor/setup',
  '/consultation',
];

const DOCTOR_NAV = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'consult', icon: 'stethoscope', label: 'Consult' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];
const RECEPTION_NAV = [
  { id: 'queue', icon: 'queue', label: 'Queue' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];

const TAB_ROUTES = {
  home: '/', queue: '/reception', patients: '/patients',
  schedule: '/schedule', finance: '/finance', consult: '/consultation',
};
const ROUTE_TO_TAB = {
  '/': 'home', '/reception': 'queue', '/patients': 'patients',
  '/schedule': 'schedule', '/finance': 'finance', '/consultation': 'consult',
};

function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useAppStore((s) => s.role);
  const toast = useAppStore((s) => s.toast);

  const isDetailPage = pathname.includes('/patients/') && pathname !== '/patients' ||
    pathname.includes('/appointments/') ||
    pathname.includes('/checkout/') ||
    pathname === '/finance/lab';

  const showNav = !HIDE_NAV_PATHS.includes(pathname) && !isDetailPage;

  const navItems = role === 'receptionist' ? RECEPTION_NAV : DOCTOR_NAV;
  const activeTab = ROUTE_TO_TAB[pathname] || 'home';

  const onNav = (id) => {
    if (id === 'consult') {
      router.push('/consultation');
    } else {
      router.push(TAB_ROUTES[id] || '/');
    }
  };

  // Capacitor back button — import is dynamic to avoid SSR issues
  useEffect(() => {
    let cleanup;
    import('@capacitor/app').then(({ App }) => {
      const listener = App.addListener('backButton', () => {
        if (pathname !== '/' && pathname !== '/reception') {
          router.back();
        }
      });
      cleanup = listener;
    }).catch(() => {});
    return () => { if (cleanup?.remove) cleanup.remove(); };
  }, [pathname]);

  // Capacitor status bar
  useEffect(() => {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#F2F2F7' }).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-jakarta, Plus Jakarta Sans), -apple-system, system-ui, sans-serif' }}>
      <FlowGuard />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {showNav && <BottomNav tab={activeTab} onTab={onNav} items={navItems} />}
      <SheetHost />
      <Toast message={toast} />
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={font.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 4.3: Commit**

```bash
git add app/globals.css app/layout.jsx
git commit -m "feat: add global CSS and root layout with Capacitor hooks"
```

---

## Task 5: Icon component

**Files:**
- Create: `dentai-app/components/icons/index.jsx`

- [ ] **Step 5.1: Create components/icons/index.jsx**

```jsx
'use client';
// Copy the entire content of project/icons.jsx verbatim here.
// Remove the last line: Object.assign(window, { Icon });
// The function is a default export:
export default function Icon({ name, size = 24, stroke = 2, color = 'currentColor', fill = 'none', style }) {
  // ... paste all path data from icons.jsx exactly as-is ...
}
```

Paste the full `Icon` function body from `project/icons.jsx` (lines 2–end, removing the `Object.assign` line). Export as default.

- [ ] **Step 5.2: Commit**

```bash
git add components/icons/
git commit -m "feat: add Icon component (SVG stroked icons)"
```

---

## Task 6: Shared UI components

**Files:**
- Create: `dentai-app/components/ui/Avatar.jsx`
- Create: `dentai-app/components/ui/Chip.jsx`
- Create: `dentai-app/components/ui/StatusChip.jsx`
- Create: `dentai-app/components/ui/SectionHeader.jsx`
- Create: `dentai-app/components/ui/ToothChip.jsx`
- Create: `dentai-app/components/ui/StageDots.jsx`
- Create: `dentai-app/components/ui/PillToggle.jsx`
- Create: `dentai-app/components/ui/PrimaryButton.jsx`
- Create: `dentai-app/components/ui/SheetHeader.jsx`
- Create: `dentai-app/components/ui/BottomSheet.jsx`
- Create: `dentai-app/components/ui/Toast.jsx`
- Create: `dentai-app/components/ui/BottomNav.jsx`
- Create: `dentai-app/components/ui/index.js`

- [ ] **Step 6.1: Port each UI component from components.jsx**

For each component listed above:

1. Create the file with `'use client';` at the top
2. Add `import Icon from '@/components/icons';` if the component uses icons
3. Add `import { getInitials } from '@/lib/data/utils';` for `Avatar`
4. Copy the component function body verbatim from `project/components.jsx`
5. Add `export default function ComponentName(...)` (or named export where multiple components share a file)

**Avatar.jsx** — needs `getInitials` import from `@/lib/data/utils`

**BottomNav.jsx** — copy `BottomNav` function from `components.jsx`. Needs `Icon` import.

**BottomSheet.jsx** — copy `BottomSheet` function from `components.jsx`.

**Toast.jsx** — copy `Toast` function from `components.jsx`.

**PrimaryButton.jsx** — copy `PrimaryButton` function from `components.jsx`.

**SheetHeader.jsx** — copy `SheetHeader` function from `components.jsx`. Needs `Icon` import.

**Chip.jsx** — copy `Chip` + `CHIP_TONES` constant.

**StatusChip.jsx** — copy `StatusChip` + `STATUS_CHIP` constant. Imports `Chip` from `./Chip`.

**SectionHeader.jsx** — copy `SectionHeader`.

**ToothChip.jsx** — copy `ToothChip`. Imports `Chip` from `./Chip`.

**StageDots.jsx** — copy `StageDots`.

**PillToggle.jsx** — copy `PillToggle`.

- [ ] **Step 6.2: Create components/ui/index.js**

```js
export { default as Avatar } from './Avatar';
export { default as Chip } from './Chip';
export { default as StatusChip } from './StatusChip';
export { default as SectionHeader } from './SectionHeader';
export { default as ToothChip } from './ToothChip';
export { default as StageDots } from './StageDots';
export { default as PillToggle } from './PillToggle';
export { default as PrimaryButton } from './PrimaryButton';
export { default as SheetHeader } from './SheetHeader';
export { default as BottomSheet } from './BottomSheet';
export { default as Toast } from './Toast';
export { default as BottomNav } from './BottomNav';
```

- [ ] **Step 6.3: Commit**

```bash
git add components/ui/
git commit -m "feat: add shared UI component library (Avatar, Chip, BottomNav, etc.)"
```

---

## Task 7: FlowGuard + SheetHost

**Files:**
- Create: `dentai-app/components/FlowGuard.jsx`
- Create: `dentai-app/components/SheetHost.jsx`

- [ ] **Step 7.1: Create components/FlowGuard.jsx**

```jsx
'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

const PUBLIC_PATHS = ['/onboarding', '/roles', '/doctor/setup'];

export default function FlowGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const started = useAppStore((s) => s.started);
  const role = useAppStore((s) => s.role);
  const doctorSetupDone = useAppStore((s) => s.doctorSetupDone);

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return;
    if (!started) { router.replace('/onboarding'); return; }
    if (!role) { router.replace('/roles'); return; }
    if (role === 'doctor' && !doctorSetupDone) { router.replace('/doctor/setup'); return; }
  }, [started, role, doctorSetupDone, pathname]);

  return null;
}
```

- [ ] **Step 7.2: Create components/SheetHost.jsx**

```jsx
'use client';
import { useAppStore } from '@/store/useAppStore';
import { BottomSheet } from '@/components/ui';
import VoiceSheet from '@/components/sheets/VoiceSheet';
import AccountSettingsSheet from '@/components/sheets/AccountSettingsSheet';
import WalkInSheet from '@/components/sheets/WalkInSheet';
import NewPatientSheet from '@/components/sheets/NewPatientSheet';
import FilterSheet from '@/components/sheets/FilterSheet';
import ProcedureDetailSheet from '@/components/sheets/ProcedureDetailSheet';
import ToothDetailSheet from '@/components/sheets/ToothDetailSheet';
import BillSheet from '@/components/sheets/BillSheet';
import PrescriptionSheet from '@/components/sheets/PrescriptionSheet';
import NewLabSheet from '@/components/sheets/NewLabSheet';
import LabDetailSheet from '@/components/sheets/LabDetailSheet';
import AddEntrySheet from '@/components/sheets/AddEntrySheet';
import NewVisitSheet from '@/components/sheets/NewVisitSheet';
import EditPatientSheet from '@/components/sheets/EditPatientSheet';
import ApptPeekSheet from '@/components/sheets/ApptPeekSheet';
import EndVisitSheet from '@/components/sheets/EndVisitSheet';
import CheckInSheet from '@/components/sheets/CheckInSheet';
import RemoveQueueSheet from '@/components/sheets/RemoveQueueSheet';
import RecordDiagnosisSheet from '@/components/sheets/RecordDiagnosisSheet';
import QueueActionsSheet from '@/components/sheets/QueueActionsSheet';

const SHEETS = {
  account: AccountSettingsSheet,
  walkin: WalkInSheet,
  newPatient: NewPatientSheet,
  filter: FilterSheet,
  voice: VoiceSheet,
  procedure: ProcedureDetailSheet,
  tooth: ToothDetailSheet,
  bill: BillSheet,
  rx: PrescriptionSheet,
  newLab: NewLabSheet,
  labDetail: LabDetailSheet,
  addEntry: AddEntrySheet,
  newVisit: NewVisitSheet,
  editPatient: EditPatientSheet,
  apptPeek: ApptPeekSheet,
  endVisit: EndVisitSheet,
  checkin: CheckInSheet,
  removeQueue: RemoveQueueSheet,
  recordDiagnosis: RecordDiagnosisSheet,
  queueActions: QueueActionsSheet,
};

export default function SheetHost() {
  const activeSheet = useAppStore((s) => s.activeSheet);
  const closeSheet = useAppStore((s) => s.closeSheet);

  if (!activeSheet) return null;
  const SheetComp = SHEETS[activeSheet.name];
  if (!SheetComp) return null;

  return (
    <BottomSheet open onClose={closeSheet} dismissable={activeSheet.name !== 'endVisit'}>
      <SheetComp params={activeSheet.params} onClose={closeSheet} />
    </BottomSheet>
  );
}
```

- [ ] **Step 7.3: Commit**

```bash
git add components/FlowGuard.jsx components/SheetHost.jsx
git commit -m "feat: add FlowGuard (auth redirect) and SheetHost (sheet registry)"
```

---

## Task 8: Odontogram component

**Files:**
- Create: `dentai-app/components/odontogram/Odontogram.jsx`

- [ ] **Step 8.1: Create components/odontogram/Odontogram.jsx**

```jsx
'use client';
// Copy entire content of project/odontogram.jsx verbatim.
// Replace: import Icon from '@/components/icons';
// Remove the last line: Object.assign(window, { Odontogram });
// Export: export default Odontogram;
```

Paste the full `Odontogram` component from `project/odontogram.jsx`. Export it as default. Add `import Icon from '@/components/icons';` at the top.

- [ ] **Step 8.2: Commit**

```bash
git add components/odontogram/
git commit -m "feat: add Odontogram dental chart component"
```

---

## Task 9: Sheets — core (12 sheets from sheets_core.jsx)

**Files:**
- Create: `dentai-app/components/sheets/VoiceSheet.jsx`
- Create: `dentai-app/components/sheets/AccountSettingsSheet.jsx`
- Create: `dentai-app/components/sheets/WalkInSheet.jsx`
- Create: `dentai-app/components/sheets/NewPatientSheet.jsx`
- Create: `dentai-app/components/sheets/FilterSheet.jsx`
- Create: `dentai-app/components/sheets/ProcedureDetailSheet.jsx`
- Create: `dentai-app/components/sheets/ToothDetailSheet.jsx`
- Create: `dentai-app/components/sheets/NewVisitSheet.jsx`
- Create: `dentai-app/components/sheets/EditPatientSheet.jsx`
- Create: `dentai-app/components/sheets/ApptPeekSheet.jsx`
- Create: `dentai-app/components/sheets/EndVisitSheet.jsx`
- Create: `dentai-app/components/sheets/CheckInSheet.jsx`
- Create: `dentai-app/components/sheets/RemoveQueueSheet.jsx`
- Create: `dentai-app/components/sheets/RecordDiagnosisSheet.jsx`
- Create: `dentai-app/components/sheets/QueueActionsSheet.jsx`

- [ ] **Step 9.1: For each sheet in sheets_core.jsx**

For each sheet component (VoiceSheet, AccountSettingsSheet, WalkInSheet, NewPatientSheet, FilterSheet, ProcedureDetailSheet, ToothDetailSheet, NewVisitSheet, EditPatientSheet, ApptPeekSheet, EndVisitSheet, CheckInSheet, RemoveQueueSheet, RecordDiagnosisSheet, QueueActionsSheet):

1. Create the file
2. Add `'use client';` at the top
3. Add imports:
```js
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Chip, StatusChip, Avatar, PrimaryButton } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { TODAY, FREQUENT_MEDICINES } from '@/lib/data/patients';
import { STAFF, CLINIC, CONSULT_OUTCOMES, XRAY_TYPES, SAMPLE_EXTRACTION, NOW_TIME, mealSlots } from '@/lib/data/queue';
import { PROCEDURE_TYPES, PROCEDURE_STAGES, getProcedureColor } from '@/lib/data/procedures';
import { formatCurrency, formatDate, formatTime, getInitials, clinicianFlags } from '@/lib/data/utils';
```
4. Copy the sheet function body verbatim from `project/sheets_core.jsx`
5. Apply the global substitution rules from the reference table at the top of this plan
6. Export as default

- [ ] **Step 9.2: Commit**

```bash
git add components/sheets/
git commit -m "feat: add core sheets (VoiceSheet, CheckInSheet, RecordDiagnosis, etc.)"
```

---

## Task 10: Sheets — billing (5 sheets from sheets_billing.jsx)

**Files:**
- Create: `dentai-app/components/sheets/BillSheet.jsx`
- Create: `dentai-app/components/sheets/PrescriptionSheet.jsx`
- Create: `dentai-app/components/sheets/NewLabSheet.jsx`
- Create: `dentai-app/components/sheets/LabDetailSheet.jsx`
- Create: `dentai-app/components/sheets/AddEntrySheet.jsx`

- [ ] **Step 10.1: For each sheet in sheets_billing.jsx**

Same process as Task 9 but for billing sheets. Additional imports needed:
```js
import { formatCurrencyK } from '@/lib/data/utils';
import { treatmentPlans } from '@/lib/data/procedures';
```

Apply global substitution rules. Export each as default.

- [ ] **Step 10.2: Commit**

```bash
git add components/sheets/BillSheet.jsx components/sheets/PrescriptionSheet.jsx components/sheets/NewLabSheet.jsx components/sheets/LabDetailSheet.jsx components/sheets/AddEntrySheet.jsx
git commit -m "feat: add billing sheets (Bill, Rx, Lab, AddEntry)"
```

---

## Task 11: Onboarding screen

**Files:**
- Create: `dentai-app/app/onboarding/page.jsx`

- [ ] **Step 11.1: Create app/onboarding/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, PrimaryButton } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';

// Copy BrandMark, HeroWelcome, HeroVoice, HeroLayers, HeroFinance, ONB_PAGES, Onboarding
// from project/screens_onboarding.jsx verbatim.
// Replace: onDone prop callback — the Onboarding component receives onDone from page.
// Remove: Object.assign(window, {...}) at the bottom.

export default function OnboardingPage() {
  const router = useRouter();
  const setStarted = useAppStore((s) => s.setStarted);

  const handleDone = () => {
    setStarted(true);
    router.push('/roles');
  };

  return <Onboarding onDone={handleDone} />;
}
```

Paste `BrandMark`, `HeroWelcome`, `HeroVoice`, `HeroLayers`, `HeroFinance`, `ONB_PAGES`, and `Onboarding` function bodies from `project/screens_onboarding.jsx` above the `export default` line.

- [ ] **Step 11.2: Commit**

```bash
git add app/onboarding/
git commit -m "feat: add /onboarding screen"
```

---

## Task 12: Roles screen

**Files:**
- Create: `dentai-app/app/roles/page.jsx`

- [ ] **Step 12.1: Create app/roles/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { useAppStore } from '@/store/useAppStore';
import { CLINIC } from '@/lib/data/queue';

// Copy RoleSelect function from project/screens_roles.jsx verbatim.
// Replace: onPick prop — handled by page.
// Remove: Object.assign(window, {...})

export default function RolesPage() {
  const router = useRouter();
  const pickRole = useAppStore((s) => s.pickRole);

  const handlePick = (r) => {
    pickRole(r);
    if (r === 'receptionist') {
      router.push('/reception');
    } else {
      router.push('/doctor/setup');
    }
  };

  return <RoleSelect onPick={handlePick} />;
}
```

Paste `RoleSelect` function body above the export.

- [ ] **Step 12.2: Commit**

```bash
git add app/roles/
git commit -m "feat: add /roles screen"
```

---

## Task 13: Doctor setup screen

**Files:**
- Create: `dentai-app/app/doctor/setup/page.jsx`

- [ ] **Step 13.1: Create app/doctor/setup/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';

// Copy DoctorSetup from project/screens_doctor_setup.jsx verbatim.
// Remove: Object.assign(window, {...})

export default function DoctorSetupPage() {
  const router = useRouter();
  const clinic = useAppStore((s) => s.clinic);
  const saveClinic = useAppStore((s) => s.saveClinic);

  const handleDone = (c) => {
    saveClinic(c);
    router.push('/');
  };

  return <DoctorSetup clinic={clinic} onDone={handleDone} />;
}
```

Paste `DoctorSetup` component above the export.

- [ ] **Step 13.2: Commit**

```bash
git add app/doctor/
git commit -m "feat: add /doctor/setup screen"
```

---

## Task 14: Home screen

**Files:**
- Create: `dentai-app/app/page.jsx`

- [ ] **Step 14.1: Create app/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { TODAY } from '@/lib/data/patients';
import { STAFF } from '@/lib/data/queue';
import { formatCurrency, formatTime, clinicianFlags, hasComplications } from '@/lib/data/utils';

// Copy Eyebrow and HomeScreen functions from project/screens_home.jsx verbatim.
// Apply all global substitution rules from the reference table.
// Remove: Object.assign(window, {...})

export default function HomePage() {
  return <HomeScreen />;
}
```

Paste `Eyebrow` and `HomeScreen` above the export. Apply substitution rules:
- `app.patients` → `usePatientStore(s => s.patients)` (destructure at top of HomeScreen)
- `app.visits` → `useVisitStore(s => s.visits)`
- `app.procedures` → `useClinicalStore(s => s.procedures)`
- `app.bills` → `useClinicalStore(s => s.bills)`
- `app.queue` → `useQueueStore(s => s.queue)`
- `app.openSheet(...)` → `openSheet(...)` from `useAppStore`
- `app.goToPatients(true)` → `router.push('/patients')` + `setPatientsFocus(true)`
- `app.enterConsult()` → `router.push('/consultation')`
- `app.openSheet('newPatient')` → `openSheet('newPatient')`
- `app.openSheet('walkin')` → `openSheet('walkin')`
- `app.setTab('finance')` → `router.push('/finance')`
- `app.openLab()` → `router.push('/finance/lab')`
- `app.openPatient(id)` → `router.push('/patients/' + id)`
- `app.openAppointment(id)` → `router.push('/appointments/' + id)`
- `app.setTab('schedule')` → `router.push('/schedule')`
- `DATA.TODAY` → `TODAY`
- `DATA.STAFF` → `STAFF`

- [ ] **Step 14.2: Commit**

```bash
git add app/page.jsx
git commit -m "feat: add / (Home) screen"
```

---

## Task 15: Reception screen

**Files:**
- Create: `dentai-app/app/reception/page.jsx`

- [ ] **Step 15.1: Create app/reception/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { SectionHeader, Chip, StatusChip } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { CLINIC, STAFF } from '@/lib/data/queue';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, parseDate, MONTHS, DAYS_FULL } from '@/lib/data/utils';

// Copy QueueStatChip, TokenBadge, ReceptionScreen from project/screens_reception.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function ReceptionPage() {
  return <ReceptionScreen />;
}
```

Key substitutions in ReceptionScreen:
- `app.queue` → `useQueueStore(s => s.queue)`
- `app.openCheckout(e.id)` → `router.push('/checkout/' + e.id)`
- `app.openSheet('checkin')` → `openSheet('checkin')`
- `app.openSheet('queueActions', ...)` → `openSheet('queueActions', ...)`
- `app.patients` → `usePatientStore(s => s.patients)`
- `app.checkoutsToday` → `useQueueStore(s => s.checkoutsToday)`
- `DATA.CLINIC` → `CLINIC`
- `DATA.TODAY` → `TODAY`

- [ ] **Step 15.2: Commit**

```bash
git add app/reception/
git commit -m "feat: add /reception screen (queue dashboard)"
```

---

## Task 16: Schedule screen

**Files:**
- Create: `dentai-app/app/schedule/page.jsx`

- [ ] **Step 16.1: Create app/schedule/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { TODAY } from '@/lib/data/patients';
import { getProcedureColor } from '@/lib/data/procedures';
import { formatTime, parseDate, MONTHS, DAYS, DAYS_FULL } from '@/lib/data/utils';

// Copy all schedule helpers and components from project/screens_schedule.jsx:
// timeToTop, topToTime, weekDays, toISO, ApptBlock, WeekView, DayView, MonthView, ScheduleScreen
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function SchedulePage() {
  return <ScheduleScreen />;
}
```

Key substitutions:
- `app.visits` → `useVisitStore(s => s.visits)`
- `app.patients` → `usePatientStore(s => s.patients)`
- `app.procedures` → `useClinicalStore(s => s.procedures)`
- `app.scheduleView` → `useAppStore(s => s.scheduleView)`
- `app.setScheduleView` → `useAppStore(s => s.setScheduleView)`
- `app.openAppointment(id)` → `router.push('/appointments/' + id)`
- `app.moveVisit(...)` → `useVisitStore(s => s.moveVisit)(...)`
- `app.addVisit(...)` → `useVisitStore(s => s.addVisit)(...)`
- `app.openSheet('newVisit', ...)` → `openSheet('newVisit', ...)`

- [ ] **Step 16.2: Commit**

```bash
git add app/schedule/
git commit -m "feat: add /schedule screen (week/day/month calendar)"
```

---

## Task 17: Patients screen

**Files:**
- Create: `dentai-app/app/patients/page.jsx`

- [ ] **Step 17.1: Create app/patients/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import Icon from '@/components/icons';
import { Avatar, Chip, StatusChip } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { formatCurrency, formatDate, getInitials } from '@/lib/data/utils';

// Copy VoiceToolbar, PATIENT_FILTERS, PatientsScreen from project/screens_patients.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function PatientsPage() {
  return <PatientsScreen />;
}
```

Key substitutions:
- `app.patientsFocus` → `useAppStore(s => s.patientsFocus)`
- `app.clearPatientsFocus()` → `useAppStore(s => s.clearPatientsFocus)()`
- `app.openPatient(id)` → `router.push('/patients/' + id)`
- `app.openSheet('filter')` → `openSheet('filter')`
- `app.openSheet('newPatient')` → `openSheet('newPatient')`
- `app.density` → `'standard'`

- [ ] **Step 17.2: Commit**

```bash
git add app/patients/page.jsx
git commit -m "feat: add /patients screen (patient list)"
```

---

## Task 18: Patient profile screen

**Files:**
- Create: `dentai-app/app/patients/[id]/page.jsx`

- [ ] **Step 18.1: Create app/patients/[id]/page.jsx**

```jsx
'use client';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Avatar, Chip, StatusChip, SectionHeader, StageDots, ToothChip, PillToggle } from '@/components/ui';
import Odontogram from '@/components/odontogram/Odontogram';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { treatmentPlans } from '@/lib/data/procedures';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatDate, formatTime, clinicianFlags, hasComplications, getProcedureColor } from '@/lib/data/utils';

// Copy all sub-components and PatientProfile from project/screens_patient_profile.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function PatientProfilePage() {
  const { id } = useParams();
  return <PatientProfile patientId={id} />;
}
```

Key substitutions:
- `app.patients` → `usePatientStore(s => s.patients)`
- `app.openAppointment(id)` → `router.push('/appointments/' + id)`
- `app.openSheet('editPatient', ...)` → `openSheet('editPatient', ...)`
- `app.openSheet('bill', ...)` → `openSheet('bill', ...)`
- `app.openSheet('rx', ...)` → `openSheet('rx', ...)`
- `app.openSheet('newVisit', ...)` → `openSheet('newVisit', ...)`
- `app.openSheet('labDetail', ...)` → `openSheet('labDetail', ...)`
- `app.updateToothState(...)` → `usePatientStore(s => s.updateToothState)(...)`
- `app.advanceProcedure(...)` → `useClinicalStore(s => s.advanceProcedure)(...)`
- `app.goBack()` → `router.back()`
- `initialTab` prop: read from searchParams or default to 'Overview'

- [ ] **Step 18.2: Commit**

```bash
git add app/patients/
git commit -m "feat: add /patients/[id] screen (patient profile)"
```

---

## Task 19: Consultation mode screen

**Files:**
- Create: `dentai-app/app/consultation/page.jsx`

- [ ] **Step 19.1: Create app/consultation/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, StageDots } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { formatDate, clinicianFlags } from '@/lib/data/utils';

// Copy ConsultModeScreen from project/screens_consult.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function ConsultationPage() {
  return <ConsultModeScreen />;
}
```

Key substitutions:
- `app.exitConsult()` → `router.push('/')`
- `app.callIn(id)` → `useQueueStore(s => s.callIn)(id)` + show toast via `useAppStore` if busy
- `app.openSheet('recordDiagnosis', ...)` → `openSheet('recordDiagnosis', ...)`
- `app.openSheet('voice', ...)` → `openSheet('voice', ...)`
- `app.openPatient(id)` → `router.push('/patients/' + id)`

- [ ] **Step 19.2: Commit**

```bash
git add app/consultation/
git commit -m "feat: add /consultation screen (consult mode)"
```

---

## Task 20: Appointment detail screen

**Files:**
- Create: `dentai-app/app/appointments/[id]/page.jsx`

- [ ] **Step 20.1: Create app/appointments/[id]/page.jsx**

```jsx
'use client';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, StatusChip, StageDots } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { TODAY } from '@/lib/data/patients';
import { formatDate, formatTime, clinicianFlags } from '@/lib/data/utils';
import { getProcedureColor } from '@/lib/data/procedures';

// Copy AppointmentScreen from project/screens_appointment.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function AppointmentPage() {
  const { id } = useParams();
  return <AppointmentScreen visitId={id} />;
}
```

Key substitutions:
- `app.goBack()` → `router.back()`
- `app.updateVisit(...)` → `useVisitStore(s => s.updateVisit)(...)`
- `app.openPatient(id)` → `router.push('/patients/' + id)`
- `app.openSheet('voice', ...)` → `openSheet('voice', ...)`

- [ ] **Step 20.2: Commit**

```bash
git add app/appointments/
git commit -m "feat: add /appointments/[id] screen (appointment detail)"
```

---

## Task 21: Checkout screen

**Files:**
- Create: `dentai-app/app/checkout/[id]/page.jsx`

- [ ] **Step 21.1: Create app/checkout/[id]/page.jsx**

```jsx
'use client';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, StatusChip, SectionHeader } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { formatCurrency, formatTime } from '@/lib/data/utils';

// Copy CheckoutScreen from project/screens_checkout.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function CheckoutPage() {
  const { id } = useParams();
  return <CheckoutScreen entryId={id} />;
}
```

Key substitutions:
- `app.goBack()` → `router.back()` then `router.push('/reception')` after checkout
- `app.checkout(id, summary)` → `useQueueStore(s => s.checkout)(id, summary)`
- `app.openSheet('bill', ...)` → `openSheet('bill', ...)`
- `app.showToast(...)` → `useAppStore(s => s.showToast)(...)`

- [ ] **Step 21.2: Commit**

```bash
git add app/checkout/
git commit -m "feat: add /checkout/[id] screen"
```

---

## Task 22: Finance screen + Lab screen

**Files:**
- Create: `dentai-app/app/finance/page.jsx`
- Create: `dentai-app/app/finance/lab/page.jsx`

- [ ] **Step 22.1: Create app/finance/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, StatusChip, SectionHeader } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { formatCurrency, formatCurrencyK, formatDate } from '@/lib/data/utils';

// Copy FinanceScreen from project/screens_finance_lab.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function FinancePage() {
  return <FinanceScreen />;
}
```

- [ ] **Step 22.2: Create app/finance/lab/page.jsx**

```jsx
'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { Chip, StatusChip, SectionHeader } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { usePatientStore } from '@/store/usePatientStore';
import { formatCurrency, formatDate } from '@/lib/data/utils';

// Copy LabScreen from project/screens_finance_lab.jsx verbatim.
// Apply global substitution rules.
// Remove: Object.assign(window, {...})

export default function LabPage() {
  return <LabScreen />;
}
```

Key substitutions for both:
- `app.labOrders` → `useClinicalStore(s => s.labOrders)`
- `app.bills` → `useClinicalStore(s => s.bills)`
- `app.clinicAccounts` → `useClinicalStore(s => s.clinicAccounts)`
- `app.openSheet('addEntry', ...)` → `openSheet('addEntry', ...)`
- `app.openSheet('newLab', ...)` → `openSheet('newLab', ...)`
- `app.openSheet('labDetail', ...)` → `openSheet('labDetail', ...)`
- `app.markLabReceived(...)` → `useClinicalStore(s => s.markLabReceived)(...)`
- `app.goBack()` → `router.back()`
- `app.openLab()` → `router.push('/finance/lab')`

- [ ] **Step 22.3: Commit**

```bash
git add app/finance/
git commit -m "feat: add /finance and /finance/lab screens"
```

---

## Task 23: Capacitor native setup + first build

**Files:**
- Modify: `dentai-app/capacitor.config.json` (already created in Task 1)

- [ ] **Step 23.1: Initialize Capacitor platforms**

```bash
cd dentai-app
npx cap init "DentWay" "com.dentway.app" --web-dir out
npx cap add ios
npx cap add android
```

Expected: `ios/` and `android/` directories created.

- [ ] **Step 23.2: Run first static build**

```bash
npm run build
```

Expected: `out/` directory generated with static files. No build errors.

- [ ] **Step 23.3: Sync to native**

```bash
npx cap sync
```

Expected: Files copied from `out/` to both `ios/App/public/` and `android/app/src/main/assets/public/`.

- [ ] **Step 23.4: Verify iOS build (Mac only)**

```bash
npx cap open ios
```

In Xcode: select a simulator, press Run. Expected: app launches and shows the Onboarding screen.

- [ ] **Step 23.5: Verify Android build**

```bash
npx cap open android
```

In Android Studio: run on emulator. Expected: app launches and shows the Onboarding screen.

- [ ] **Step 23.6: Commit**

```bash
git add ios/ android/ capacitor.config.json
git commit -m "chore: add Capacitor iOS and Android native projects"
```

---

## Task 24: End-to-end verification

- [ ] **Step 24.1: Full flow — Doctor path**

Start dev server: `npm run dev`

Navigate to http://localhost:3000 and verify:
- `/onboarding` shows all 4 onboarding pages with animations
- Tapping Continue/Skip navigates to `/roles`
- Selecting Doctor navigates to `/doctor/setup`
- Completing setup navigates to `/` (Home)
- Home screen shows greeting, search, Start consultation CTA, quick actions, today's schedule
- All 4 quick action buttons open correct sheets
- "Start consultation" navigates to `/consultation`
- Exit from consultation returns to `/`
- Bottom nav shows: Home, Patients, Consult, Schedule, Finance
- Each tab navigates to correct route
- Patient rows navigate to `/patients/[id]`
- Appointment rows navigate to `/appointments/[id]`
- All sheets open and close correctly
- Odontogram responds to tooth taps

- [ ] **Step 24.2: Full flow — Receptionist path**

In `/roles`, select Receptionist:
- Navigates directly to `/reception`
- Bottom nav shows: Queue, Patients, Schedule, Finance
- Check In button opens CheckInSheet
- Ready-for-checkout rows open `/checkout/[id]`
- Queue entries show correct status chips and token badges
- Checkout flow completes and navigates back to `/reception`

- [ ] **Step 24.3: Verify all sheets**

Open each of the 20 sheets and confirm:
- VoiceSheet: recording → processing → review states work
- BillSheet: add items, set discount/paid, save
- PrescriptionSheet: add medicines, save
- NewLabSheet: fill fields, submit
- LabDetailSheet: mark received
- RecordDiagnosisSheet: all fields editable, confirm saves consult
- EndVisitSheet: complete consult advances queue
- CheckInSheet: adds patient to queue
- AccountSettingsSheet: shows clinic info, sign-out works
- All other sheets: open, interact, close without errors

- [ ] **Step 24.4: Verify mobile build**

```bash
npm run build:mobile
```

Expected: build completes, cap sync succeeds, no errors.

Open in iOS Simulator or Android Emulator and verify:
- Safe-area insets respected (content not behind notch or home bar)
- Status bar visible and styled correctly
- Android back button navigates back
- No white flash on startup (splash screen shows)

- [ ] **Step 24.5: Final commit**

```bash
git add .
git commit -m "feat: complete DentWay Next.js + Capacitor migration"
```

---

## Self-Review Notes

- **Spec section 7 (Visual Fidelity)**: Every screen task uses copy-verbatim-first approach. Substitution rules are mechanical, not design changes. ✓
- **Spec section 8 (CSS)**: globals.css copied exactly, only safe-area additions permitted. ✓  
- **Spec section 9 (Data)**: All data field names preserved, no normalization. Seed data is byte-identical. ✓
- **All 20 sheets covered**: 15 core + 5 billing = 20. SheetHost registry has all 20. ✓
- **All 13 routes covered**: /onboarding, /roles, /doctor/setup, /, /reception, /schedule, /patients, /patients/[id], /consultation, /appointments/[id], /checkout/[id], /finance, /finance/lab. ✓
- **Capacitor back button on Android**: Wired in layout.jsx via dynamic import. ✓
- **Safe-area insets**: `.safe-top` / `.safe-bottom` classes added to globals.css. Each screen's top nav bar and BottomNav must use these classes — verify during Task 24. ✓
- **No server components**: Every file starts with `'use client'`. `output: 'export'` prevents accidental server usage. ✓
