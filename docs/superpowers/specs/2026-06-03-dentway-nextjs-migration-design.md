---
name: dentway-nextjs-migration-design
description: Full design spec for migrating the DentWay dental clinic prototype from a single HTML/Babel/CDN app into a production Next.js 15 + Capacitor mobile app for iOS App Store and Google Play Store
metadata:
  type: project
---

# DentWay — Next.js + Capacitor Migration Design

**Date:** 2026-06-03  
**Approach:** Direct port, Next.js 15 App Router + Zustand, static export for Capacitor  
**Deployment target:** iOS App Store + Google Play Store via Capacitor  
**Data layer:** Mock data, client-side Zustand state only (no backend)

---

## 1. Tooling & Project Setup

### Stack
- **Next.js 15** (App Router), React 19
- **Plain JavaScript** (no TypeScript) — stays as close to the source as possible
- **Zustand** for global state management
- **`output: 'export'`** in `next.config.js` — required for Capacitor static file serving
- **Capacitor 6**: `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`
- **Capacitor plugins**: `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/app`

### Styling
- `globals.css` copied verbatim from the existing project — no conversion
- All inline styles from source components preserved exactly
- No Tailwind, no CSS modules, no Shadcn
- TweaksPanel **removed** — accent, font, density hard-coded as `:root` CSS variables:
  - `--accent: #1C1C1E`
  - `--accent-ink: #FFFFFF`
  - Font: `Plus Jakarta Sans`
  - Density: `standard`

### Mobile viewport
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```
- `viewport-fit=cover` fills notch + rounded corners on device
- `env(safe-area-inset-top)` applied to top nav bars
- `env(safe-area-inset-bottom)` applied to BottomNav

### next.config.js
```js
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
```

### capacitor.config.json
```json
{
  "appId": "com.dentway.app",
  "appName": "DentWay",
  "webDir": "out",
  "server": { "androidScheme": "https" }
}
```

### package.json scripts
```json
"build:mobile": "next build && npx cap sync",
"open:ios": "npx cap open ios",
"open:android": "npx cap open android"
```

---

## 2. Data Layer & State Management

### ES Module data files (`lib/data/`)
Each plain-JS data file from the prototype becomes a named-export ES module:

| File | Contents |
|------|----------|
| `lib/data/patients.js` | patient records |
| `lib/data/queue.js` | queue entries, staff, clinic, CONSULT_OUTCOMES, XRAY_TYPES, SAMPLE_EXTRACTION |
| `lib/data/procedures.js` | procedures, treatment plans, PROCEDURE_STAGES, PROCEDURE_TYPES, PROC_COLORS |
| `lib/data/visits.js` | visit records |
| `lib/data/bills.js` | bills |
| `lib/data/lab.js` | lab orders |
| `lib/data/prescriptions.js` | prescriptions |
| `lib/data/accounts.js` | clinic accounts |
| `lib/data/utils.js` | formatCurrency, formatDate, formatDateLong, formatTime, getInitials, calculateAge, clinicianFlags, hasComplications, parseDate, MONTHS, DAYS, DAYS_FULL |

All `window.*` and `window.DATA.*` assignments removed. Everything imported explicitly.

### Zustand stores (`store/`)

| Store | Owns |
|-------|------|
| `useAppStore` | `started`, `role`, `consultMode`, `doctorSetupDone`, `toast`, `activeSheet` (name + params), `clinic` — plus actions: `openSheet`, `closeSheet`, `showToast`, `pickRole`, `switchRole`, `signOut`, `saveClinic`, `enterConsult`, `exitConsult` — **no `tab` field**: current tab is derived from `usePathname()` |
| `usePatientStore` | `patients` — `addPatient`, `updatePatient`, `updateToothState` |
| `useVisitStore` | `visits` — `addVisit`, `updateVisit`, `moveVisit` |
| `useQueueStore` | `queue`, `checkoutsToday` — `callIn`, `completeConsult`, `checkout`, `addToQueue`, `removeFromQueue` |
| `useClinicalStore` | `procedures`, `labOrders`, `bills`, `prescriptions`, `clinicAccounts` — `advanceProcedure`, `markLabReceived`, `addLabOrder`, `saveBill`, `saveRx`, `addAccount` |

All stores initialise from seed data. State resets to seed on app restart (no persistence).

---

## 3. Routing & Navigation

### Route map

| Route | Screen | Source file |
|-------|--------|-------------|
| `/onboarding` | Onboarding | screens_onboarding.jsx |
| `/roles` | RoleSelect | screens_roles.jsx |
| `/doctor/setup` | DoctorSetup | screens_doctor_setup.jsx |
| `/` | HomeScreen | screens_home.jsx |
| `/reception` | ReceptionScreen | screens_reception.jsx |
| `/schedule` | ScheduleScreen | screens_schedule.jsx |
| `/patients` | PatientsScreen | screens_patients.jsx |
| `/patients/[id]` | PatientProfile | screens_patient_profile.jsx |
| `/consultation` | ConsultModeScreen | screens_consult.jsx |
| `/appointments/[id]` | AppointmentScreen | screens_appointment.jsx |
| `/checkout/[id]` | CheckoutScreen | screens_checkout.jsx |
| `/finance` | FinanceScreen | screens_finance_lab.jsx |
| `/finance/lab` | LabScreen | screens_finance_lab.jsx |

### Stack push → router.push()

| Old action | New navigation |
|-----------|---------------|
| `openPatient(id)` | `router.push('/patients/' + id)` |
| `openAppointment(id)` | `router.push('/appointments/' + id)` |
| `openCheckout(id)` | `router.push('/checkout/' + id)` |
| `openLab()` | `router.push('/finance/lab')` |
| `goBack()` | `router.back()` |
| `setTab('home')` | `router.push('/')` |
| `setTab('queue')` | `router.push('/reception')` |
| `setTab('patients')` | `router.push('/patients')` |
| `setTab('schedule')` | `router.push('/schedule')` |
| `setTab('finance')` | `router.push('/finance')` |
| `enterConsult()` | `router.push('/consultation')` |

### Sheets → UI state (not routes)
All 16 sheets remain bottom-drawer overlays driven by `openSheet(name, params)` / `closeSheet()` in `useAppStore`. A single `<SheetHost />` in `app/layout.jsx` renders the active sheet.

### Flow guard
`<FlowGuard />` client component in `app/layout.jsx` reads from `useAppStore` and redirects:
- `!started` → `/onboarding`
- `!role` → `/roles`
- `role === 'doctor' && !doctorSetupDone` → `/doctor/setup`

### BottomNav visibility
Hidden on: `/onboarding`, `/roles`, `/doctor/setup`, `/consultation`, `/patients/[id]`, `/appointments/[id]`, `/checkout/[id]`, `/finance/lab`.  
Determined by checking `usePathname()` in layout.

### Tab → route mapping
| Tab id | Doctor route | Receptionist route |
|--------|-------------|-------------------|
| `home` | `/` | — |
| `queue` | — | `/reception` |
| `patients` | `/patients` | `/patients` |
| `schedule` | `/schedule` | `/schedule` |
| `finance` | `/finance` | `/finance` |
| `consult` | `/consultation` | — |

---

## 4. Component Organization

```
components/
  ui/
    Avatar.jsx
    Chip.jsx
    StatusChip.jsx
    SectionHeader.jsx
    ToothChip.jsx
    StageDots.jsx
    PillToggle.jsx
    BottomNav.jsx
    BottomSheet.jsx
    Toast.jsx
    NavBar.jsx
    SearchBar.jsx
    EmptyState.jsx
    (+ all other shared primitives from components.jsx)
  icons/
    index.jsx             ← full Icon component (icons.jsx)
  odontogram/
    Odontogram.jsx        ← odontogram.jsx
  sheets/
    AccountSettingsSheet.jsx
    WalkInSheet.jsx
    NewPatientSheet.jsx
    FilterSheet.jsx
    VoiceSheet.jsx
    ProcedureDetailSheet.jsx
    ToothDetailSheet.jsx
    BillSheet.jsx
    PrescriptionSheet.jsx
    NewLabSheet.jsx
    LabDetailSheet.jsx
    AddEntrySheet.jsx
    NewVisitSheet.jsx
    EditPatientSheet.jsx
    ApptPeekSheet.jsx
    EndVisitSheet.jsx
    CheckInSheet.jsx
    RemoveQueueSheet.jsx
    RecordDiagnosisSheet.jsx
    QueueActionsSheet.jsx
  SheetHost.jsx           ← renders active sheet from useAppStore
  FlowGuard.jsx           ← auth/flow redirect logic
```

Every component file has `'use client'` at the top. The entire app is client-rendered.

Screen-specific sub-components (e.g. `HomeCard`, `QueueRow`, `PatientRow`) live co-located as named exports within the screen's page file, or in a `_components/` subfolder if the page file grows large.

---

## 5. Capacitor Integration

### Build pipeline
```bash
next build          # generates static files in /out
npx cap sync        # copies /out into ios/ and android/
npx cap open ios    # Xcode → App Store submission
npx cap open android # Android Studio → Play Store submission
```

### Android back button
`@capacitor/app` `backButton` listener in `app/layout.jsx` calls `router.back()` — prevents the Android back button from closing the app unexpectedly.

### Status bar
`@capacitor/status-bar` called in `app/layout.jsx` on mount:
- iOS: `StatusBar.setStyle({ style: Style.Dark })`
- Android: `StatusBar.setBackgroundColor({ color: '#F2F2F7' })`

### Safe area
```css
/* applied to top nav bars */
padding-top: env(safe-area-inset-top);

/* applied to BottomNav */
padding-bottom: env(safe-area-inset-bottom);
```

---

## 6. Migration Rules (Non-Negotiable)

1. Every screen, component, sheet, and interaction from the source is preserved
2. No layouts changed, no spacing changed, no colors changed
3. No Shadcn, no Tailwind, no new design system
4. All inline styles copied verbatim from source
5. `globals.css` copied verbatim, tweakable CSS variables hard-coded
6. All 20 sheets implemented and working
7. Every button has a working action — no placeholders, no TODOs
8. TweaksPanel removed entirely (not converted, just deleted)
9. IOSDevice frame removed entirely (not converted, just deleted)
10. `output: 'export'` always — no server-side features used

---

## 7. Visual Fidelity Requirements

**The source JSX is the visual source of truth.** Any visual difference between the migrated app and the source app is a migration bug.

### DOM & layout
- Do not replace components with alternative implementations
- Do not rebuild layouts from scratch
- Do not change DOM hierarchy unless technically required by Next.js
- Do not change element ordering
- Do not change spacing values, border-radius values, shadows, or z-index values

### Typography & colour
- Do not change typography scales or font weights
- Do not change any colour values — use the same hex/rgba values as source

### Motion
- Do not change animations or transitions
- All `@keyframes` from `globals.css` must be preserved (sheetUp, fadeIn, cascadeIn, toastUp, donePulse, wave, dots, pageInRight, slideInRight)
- All animation class names (`.slide-in`, `.sheet-anim`, `.page-in`, `.scrim`) must remain

### Component porting order (per component)
1. Copy source component verbatim
2. Verify it renders correctly in isolation
3. Wire Zustand state and router navigation
4. Only then move to the next component

Do not rewrite a working component. Prefer direct copy-paste migration over refactoring.

---

## 8. CSS Preservation Rules

`globals.css` must be copied exactly into `app/globals.css`.

Do not:
- Reformat or re-order rules
- Convert to Tailwind utility classes
- Convert to CSS modules
- Convert to styled-components or Emotion
- Remove any selector
- Rename any CSS variable

Only permitted changes to `globals.css`:
- Remove `@import` for fonts that are now loaded via `next/font` in layout
- Add `env(safe-area-inset-top/bottom)` padding to nav/bottom bar selectors

---

## 9. Data Preservation Rules

Existing data structures are canonical. The migrated app must accept the exact same mock data shape as the source.

Do not:
- Rename any field
- Normalise or restructure objects
- Remove fields (even unused ones)
- Infer new schemas
- Add required fields that the source data does not have

Every Zustand store action must accept and produce objects with the same shape as the corresponding `window.DATA.*` structures in the source.
