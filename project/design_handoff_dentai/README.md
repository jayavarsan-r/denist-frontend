# Handoff: DentAI — Clinic Operating System (Doctor + Receptionist)

## Overview
DentAI is a **mobile-first dental clinic operating system** for small Indian dental practices. It is **voice-first** and **operational** — the design philosophy is "a calm clinical copilot, not accounting/admin software." Two roles share one app and one live patient queue:

- **Doctor** — runs consultations, dictates diagnoses (voice → structured plan/prescription/next-visits), tracks longitudinal treatment.
- **Receptionist** — checks patients in, manages the live queue, handles checkout & payment.

The guiding product principle throughout: **one dominant action per screen, directional visual hierarchy, color used only to carry meaning, minimal cognitive load** (the target user is a busy, non-technical clinic owner). Every screen should answer "what needs action right now?" in 2–3 seconds.

---

## About the Design Files
The files in `reference/` are a **design prototype built in HTML/JSX** — they show intended look, layout, copy, and interaction. They are **NOT production code to ship directly.** They run via React 18 + Babel-in-the-browser (no build step) purely so they can be previewed instantly.

**Your task:** recreate these designs in a real, production codebase. The component logic translates almost 1:1, but you will replace the prototype's patterns (globals on `window`, in-browser Babel, hand-rolled router) with proper modules, a build pipeline, real state management, and a backend.

If a codebase already exists, follow its conventions. If not, **recommended stack:**
- **React Native (Expo)** or **Flutter** for a true native mobile app (this is a phone product — App Store / Play Store), **or**
- **Next.js / Vite + React + TypeScript** as an installable PWA if web-first is preferred.
- State: Zustand or Redux Toolkit (the prototype uses a single context object — see *State Management*).
- Backend: any REST/GraphQL API; the data shapes in `reference/data.js` and `reference/data_queue.js` are your schema starting point.

---

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, copy, and interactions are final and intentional. Recreate pixel-accurately. The canvas is a fixed **402 × 874 px** iPhone frame (the `ios-frame.jsx` bezel is prototype-only chrome — drop it; build to the device's real safe-area insets).

> **Design-system note.** This prototype was built in a self-contained **iOS-style** system (light grey canvas, system blue, Plus Jakarta Sans) per the original product spec — NOT the "Pocket" design system attached to the project. The tokens below are the source of truth. If your team has standardized on Pocket (warm paper / coral / Geist), that re-skin is a deliberate decision to make explicitly — the *structure, hierarchy, and behavior* documented here are what matter and should be preserved either way.

---

## Design Tokens
From `reference/globals.css`. Hierarchy comes from **size + weight + opacity**, not new greys.

### Color
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F2F2F7` | App canvas (light grey) |
| `--surface` | `#FFFFFF` | Cards, sheets, headers |
| `--text-primary` | `#1C1C1E` | Headings, primary text |
| `--text-secondary` | `#6E6E73` | Body, secondary |
| `--text-tertiary` | `#AEAEB2` | Hints, passive |
| `--border` | `rgba(60,60,67,0.18)` | Inputs, structured borders |
| `--border-light` | `rgba(60,60,67,0.08)` | Hairline list dividers |
| `--accent` | `#1C1C1E` (ink) | Primary action / active. **Tweakable** (also offered: `#007AFF`, `#1B86B8`, `#1E8E3E`, `#7A3DB8`) |
| `--accent-ink` | `#FFFFFF` | Text/icon on accent |
| `--blue` | `#007AFF` | Links / actionable items |
| `--red` | `#FF3B30` | Medical risk / overdue / destructive |
| `--orange` | `#FF9500` (and `#FF9F0A`) | Pending payment / attention |
| `--green` | `#34C759` (text `#1E8E3E`) | Money received / done |
| `--teal` | `#32ADE6` (text `#1B86B8`) | Lab / informational |
| `--purple` | `#BF5AF2` | Crown procedure / referral |

**Strict color semantics (especially Finance):** GREEN = received · ORANGE = pending · RED = overdue/medical/destructive · BLUE = actionable · GREY = passive/done. Never decorative.

### Procedure colors (block bg / border / dot)
RCT `#6366F1` · Extraction `#FF3B30` · Scaling `#34C759` · Crown `#BF5AF2` · Implant `#32ADE6` · Filling `#007AFF` · Other `#6E6E73`. (See `getProcedureColor()` in `data.js`.)

### Typography
- **Family:** Plus Jakarta Sans (400/500/600/700). Numerals use `font-variant-numeric: tabular-nums` (class `.tnum`) for column alignment. Tweakable alternates: Manrope, DM Sans.
- **Scale (px):** page title 34/700/-0.03em · screen title 28–30/700/-0.03em · nav title 17/600 · row primary 16–17/600 · body 15–16/400 · meta 13/400 secondary · eyebrow 11–12/700/uppercase/0.06em tertiary.
- **Body floor 15px; never below 13px.** Max ~2 weights + 4 sizes per screen.

### Spacing / radii / shadow
- Screen padding **20–22px** horizontal. Section gap **24–28px**. Row vertical padding 11–14px.
- Radii: cards/sheets `16px`, hero/action blocks `18–22px`, bottom sheet top `20px`, pills full.
- `--elevation-1: 0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)` · `--elevation-2: 0 4px 12px rgba(0,0,0,0.10)…` (sheets).
- **Touch target floor 44px.**

### Motion (use spring easing `cubic-bezier(0.32,0.72,0,1)`, never linear)
sheet-up 340ms · page-in (onboarding) 320ms · screen slide-in 300ms · cascade-in (success lists) 400ms staggered 80ms · waveform/recording pulses. Respect `prefers-reduced-motion`.

---

## Architecture & Navigation
A **role gate** sits on top of a stack+tab router (`reference/app.jsx`).

**Boot flow:** Onboarding (4 pages) → Role select → *(Doctor only)* Doctor setup (clinic registration) → role's app.

**Doctor bottom nav (5):** Home · Patients · **Consult** · Schedule · Finance(=“Money”)
**Receptionist bottom nav (4):** **Queue** · Patients · Schedule · Finance

"Consult" enters a full-screen **Consult Mode** (nav hidden). Stack routes (push/back, slide-in): Patient profile, Appointment, Lab, Checkout. Modal **bottom sheets** for all create/edit/detail actions.

---

## Screens / Views

### 1. Onboarding (`screens_onboarding.jsx`)
4 swipeable value-prop pages (calm copilot · voice files itself · plan/procedure/visit connected · accounted-for finance). Animated hero composition per page, progress dots (active dot widens to 22px), "Skip" top-right, primary "Continue" → "Get started". Purpose: set the calm/voice-first tone.

### 2. Role Select (`screens_roles.jsx`)
Two large cards: **Doctor** / **Receptionist**, each icon + title + one-line description, cascade-in. Picks the role; switchable later from account sheet.

### 3. Doctor Setup (`screens_doctor_setup.jsx`)
First-run clinic registration, **one decision per step** (3 steps + summary), typography-led:
1. *About you* — name + specialty pills.
2. *Your clinic* — clinic name, city, address (large underline text fields).
3. *Working hours* — open days (7 toggle chips), open/close time, appointment slot length (15/30/45/60).
4. *Summary* — review rows → "Start using DentAI". Thin top progress bar; Back chevron; Continue disabled until valid.

### 4. Doctor Home (`screens_home.jsx`) — "the operating surface"
Calm, typography-led, hairline lists (NOT boxed cards). Priority order:
1. Greeting (real doctor name + clinic).
2. **Search** patient (hero, full-width, mic affordance).
3. **Start consultation** — the single accent CTA; subtitle shows queue count / "1 in chair".
4. **Four quick-action buttons** (2×2 grid, each gently tinted + white icon circle, instantly distinguishable): New patient (blue), Walk-in (green), Bills (orange), Lab (teal).
5. **Needs attention** — only if present; semantic dot rows (red medical flag / orange pending payment).
6. **Continue treatment** — ongoing procedures with stage + visit progress bar (longitudinal).
7. **Today** — hairline appointment list, time / name / procedure / status dot.

### 5. Patients List (`screens_patients.jsx`)
Search (name/phone, mic), filter/sort sheet, hairline patient rows (avatar with red dot if medical flag, phone, last visit, last procedure, outstanding in orange). Voice toolbar pinned bottom. "+" opens New Patient sheet.

### 6. Patient Profile (`screens_patient_profile.jsx`) — 5 tabs
Hero (avatar, name, tappable phone, age/gender/blood, status chip), red medical-flag banner, outstanding banner, chief complaint. Tabs: **Overview** (diagnosis, current treatment cards, upcoming visits, history), **Cases** (treatment plans → procedure cards w/ stage stepper), **Tooth Map** (FDI **odontogram** — see `odontogram.jsx`, tap a tooth → state sheet), **Lab** (orders), **Billing** (totals, cost breakdown, bills, prescriptions). Voice toolbar pinned.
> *Known redesign direction (not yet done):* move this from navigation-first 5 tabs → context-first (lead with current treatment, today's notes, previous Rx, allergies, next visit; billing/lab surface contextually). Implement profile context-first if building fresh.

### 7. Appointment Detail (`screens_appointment.jsx`)
Patient card, **status stepper** (Confirmed → Arrived → Done, animated pulse on current), advance button, procedure context rows, stage stepper, editable visit notes + next steps (mic), actions (WhatsApp reminder, no-show). Completing a visit opens the **End-of-visit sheet** → voice dictation → **magic-moment** cascade (what changed: visit complete, note saved, next appt suggested, lab needed, payment reminder).

### 8. Schedule (`screens_schedule.jsx`)
Segmented **Day / Week / Month**. **Week is an agenda list** (day-grouped hairline rows — NOT a 7-column grid; the grid was removed as visual clutter). Each row: time, procedure color bar, name, procedure, status dot. Today auto-scrolled into view, past days dimmed. Day = single-column timeline; Month = dot-density calendar.

### 9. Finance / "Money" (`screens_finance_lab.jsx` → `FinanceScreen`) — payment-first
Operational payment queue, NOT an analytics dashboard. Order:
1. **Three plain stats:** Collected today (green) · Patients owe (orange) · Owed to labs (orange). No margin %, no expense breakdown.
2. **Pending payments — DOMINANT.** Per patient: avatar, name, procedure, age-of-debt (overdue >14d → **red**), big amount, **"Collect"** (the one action). Sorted overdue-first.
3. **Lab payments** as workflow states ("Delivered · pay lab" orange / "Awaiting delivery" grey) — not a ledger.
4. **Recent activity** — collapsed by default, secondary.

### 10. Lab Orders (`screens_finance_lab.jsx` → `LabScreen`)
Filter pills, 3 summary stats, lab order cards (status, patient, work, dates, overdue accent, cost→billed→margin, "Mark received").

### 11. Consult Mode (`screens_consult.jsx`) — doctor full-screen, one dominant action
Slim top bar: **Exit** top-left (safe, labeled), **LIVE** indicator right. Then on one continuous surface: "Now treating · Token N" eyebrow → patient name (30px) → medical-risk banner (red) → **chief complaint as the anchor** (20px) → quiet ongoing-treatment line → inline reference links (History · Previous Rx · X-ray) → **Record diagnosis** (the single dominant accent block, big mic). Below: "Next patient · up next" quiet human queue. Empty state: "The chair is empty" + Call-in-next.
**Record Diagnosis sheet:** idle → recording (waveform + timer + stop) → processing (dots) → review (extracted diagnosis/procedure/sittings/cost + prescription with B/L/D meal-timing, amber dot = uncertain, re-record) → create → **done cascade** (saved, plan created, visits scheduled, Rx ready, sent to front desk) → next patient. On completion the patient auto-advances to `ready_for_checkout` and the next waiting patient is auto-called.

### 12. Receptionist Queue (`screens_reception.jsx` → `ReceptionScreen`)
Header (front desk, date) + 3 stats (waiting / in consult / to checkout). **Check in a patient** primary CTA. Sections: **Ready for checkout** (teal, tappable → Checkout), **In consultation** (amber, live), **Waiting** — each row has **ONE obvious action: "Call in"** (single overflow "⋯" for secondary: view profile / remove). One banner when doctor is busy (no repeated helper text). "Checked out today" summary.

### 13. Check-In Flow (`screens_reception.jsx` → `CheckInSheet`)
4-step sheet: (1) existing search / new patient, (2) chief complaint via voice or text + priority, (3) X-rays/reports attach (optional), (4) confirm + next token → adds to queue.

### 14. Checkout (`screens_checkout.jsx`)
Pulls the doctor's recorded plan. Patient + medical banner, today's procedure (outcome chip), **sittings stepper**, **payment** (editable quoted price, collecting-now, method Cash/UPI/Card, live balance + status), auto-scheduled next appointments, **prescription** table with **B/L/D meal-timing grid** + PDF/Share, "Approve & checkout" → moves patient to `checked_out` + logs to "checked out today".

### Sheets (`sheets_core.jsx`, `sheets_billing.jsx`)
Voice capture, New/Edit patient, Tooth detail, Procedure detail, Walk-in, New visit, New lab, Lab detail, Add entry, Account (role + **Switch role** + sign out), Bill builder, Prescription builder, Queue actions, Remove from queue.

---

## Interactions & Behavior
- **Voice is the primary input metaphor** everywhere (mic on fields, dictation flows). In the prototype it's *simulated* with canned extractions — in production wire to a speech-to-text + LLM extraction service (Tamil + English). Always show a **review step** with uncertain fields flagged (amber dot) before saving.
- **Optimistic, immediate** state updates; toasts confirm ("Saved", "Added to queue", "Checked out · ₹4,000 collected").
- **Bottom sheets** animate up (340ms spring), dismiss on scrim tap (except blocking flows like end-visit).
- **Stack navigation** slides in 300ms; back returns.
- **Drag-to-reschedule** existed on the old week grid; the agenda list replaced it — reschedule via tap → edit instead.
- **Reduced motion**: show end-states, skip entrance animations (important for the entrance opacity gates).

## State Management
Prototype centralizes everything in one `app` context object (see `App()` in `app.jsx`). Port to a store with these slices:
- **session:** `started`, `role` (`doctor|receptionist`), `consultMode`, `clinic` (doctorName, specialty, clinicName, city, days, open, close, slot), `doctorSetupDone`.
- **nav:** `tab`, `stack[]`, `sheet`, `scheduleView`.
- **domain data:** `patients`, `visits`, `procedures`, `treatmentPlans`, `labOrders`, `bills`, `prescriptions`, `clinicAccounts`, `queue`, `checkoutsToday`.
- **key actions / transitions:**
  - Queue state machine: `waiting → in_consultation → ready_for_checkout → checked_out`.
  - `callIn(id)` — only if no one currently `in_consultation`.
  - `completeConsult(id, consult)` — sets `ready_for_checkout` + **auto-calls next waiting** patient.
  - `checkout(id, summary)` — sets `checked_out`, appends to `checkoutsToday`.
  - `advanceProcedure(id)` — marks next stage complete, increments visits, flips to `completed` when all done.
  - `addToQueue`, `removeFromQueue`, `addPatient/updatePatient`, `updateToothState`, `markLabReceived`, `saveBill`, `saveRx`, `addAccount`, `moveVisit`.
- **Cross-role shared state is the headline:** a doctor finishing a consult must instantly surface that patient on the receptionist's checkout list (in the prototype it's shared memory; in production it's a shared backend + realtime/poll).

## Data Model
Use `reference/data.js` (patients, procedures w/ stages, treatmentPlans, visits, labOrders, bills, prescriptions, clinicAccounts, procedure-stage templates, frequent medicines) and `reference/data_queue.js` (queueEntries, staff, clinic, consult outcomes, x-ray types, sample voice extraction) as the **schema starting point** and seed/fixtures. All money is INR (`₹`, `en-IN` grouping). Dental notation is **FDI** (tooth numbers like 36, 14).

## Assets
- **No external image assets.** All icons are inline stroked SVG (24×24, 2px round) in `reference/icons.jsx` — map to **Lucide** in production (same stroke discipline) where possible; the odontogram is custom-drawn SVG (keep or rebuild from `odontogram.jsx`).
- Fonts via Google Fonts (Plus Jakarta Sans, Manrope, DM Sans).
- `ios-frame.jsx` and `tweaks-panel.jsx` are **prototype-only chrome — do not port.**

## Files (in `reference/`)
`DentWay.html` (entry/load order) · `app.jsx` (router/state/role gate) · `globals.css` (tokens) · `data.js`, `data_queue.js` (schema/seed) · `components.jsx` (Avatar, Chip, StatusChip, BottomSheet, Field, BottomNav, NavBar, stepper, pills, Toast, etc.) · `icons.jsx` · `odontogram.jsx` · screens: `screens_onboarding/roles/doctor_setup/home/patients/patient_profile/appointment/schedule/finance_lab/reception/checkout/consult.jsx` · sheets: `sheets_core.jsx`, `sheets_billing.jsx`. (`ios-frame.jsx`, `tweaks-panel.jsx` = prototype chrome, ignore.)

---

## Build priority (suggested)
1. Tokens + base components + role gate + nav.
2. Doctor: Home → Consult Mode → Record Diagnosis → Patient Profile.
3. Receptionist: Queue → Check-in → Checkout. **Verify the cross-role consult→checkout handoff.**
4. Schedule (agenda) + Finance (payment queue) + Lab.
5. Replace simulated voice/PDF with real STT+LLM and document generation.
