# FULL SYSTEM ANALYSIS — DentWay / DentAI

**Prepared:** 2026-06-03  
**Frontend:** `dentai-app/` (Next.js 14 + Capacitor + Zustand)  
**Backend:** `backend/` (Express.js + Supabase PostgreSQL + Sarvam AI + Gemini)

---

## Section 1 — System Overview

### What the Frontend Does

DentAI is a dental clinic management application built with Next.js 14 (App Router) and Capacitor for cross-platform mobile deployment. It serves two distinct user roles:

**Doctor workflow:** Dashboard → live consultation queue → voice-dictated diagnosis capture → treatment plan generation → prescription creation → schedule management → patient records

**Receptionist workflow:** Patient check-in → queue management → xray capture → checkout → billing → lab order tracking → finance overview

The frontend is a **fully functional UI prototype with no backend connectivity**. All data lives in Zustand stores seeded from static JS files in `lib/data/`. Every AI/voice feature is simulated with `setTimeout` callbacks returning hardcoded `SAMPLE_EXTRACTION` objects. There are no `fetch`, `axios`, or Supabase client calls anywhere in the frontend codebase.

### What the Backend Does

The backend is an Express.js REST API (Node.js) backed by Supabase (PostgreSQL). It is production-ready with:
- OTP-based phone authentication → JWT sessions
- Multi-clinic architecture (clinics, staff, roles)
- Full patient management with visits, appointments, treatment plans, prescriptions, xrays
- AI pipeline: Sarvam AI speech-to-text → Google Gemini LLM note structuring
- Supabase Storage for voice recordings and x-ray images
- PDF generation for prescriptions (PDFKit)
- Background audio cleanup job (18-month retention)

The backend is at **approximately 70% of what the frontend requires**, with solid foundations that need targeted extension rather than replacement.

### Current Alignment

The systems are **completely disconnected**. The frontend was built as a prototype/demo and the backend was built as an independent API. They share conceptual domain alignment (patients, visits, queue, prescriptions) but differ in:
- Schema shape (field names, data types, normalization strategy)
- Entity completeness (procedures, lab orders, bills, odontogram not in backend)
- Authentication model (backend: OTP+JWT; frontend: local Zustand state only)
- AI integration (backend: real Sarvam+Gemini pipeline; frontend: setTimeout simulation)

---

## Section 2 — Frontend Entity Inventory

Every entity used by the frontend codebase:

| Entity | Where Used | Key Fields |
|--------|-----------|------------|
| **Clinic** | AppStore, DoctorSetup | doctorName, specialty, clinicName, city, address, days[], open, close, slotMinutes |
| **Staff** | Hardcoded STAFF const, nav | id, name, initials, role |
| **Patient** | usePatientStore, all screens | id, name, phone, age, gender, bloodGroup, hasDiabetes, hasHypertension, hasHeartCondition, isPregnant, isOnBloodThinners, allergies[], currentMedications[], clinicalNotes, chiefComplaint, status, teeth{toothNum: state} |
| **Visit** (Appointment) | useVisitStore, schedule, appt detail | id, patientId, procedureId, date, startTime, durationMinutes, status (confirmed/arrived/done/no_show), visitNumber, totalVisits, clinicalNotes, proceduresDone, nextSteps, medications[] |
| **QueueEntry** | useQueueStore, reception, consultation | id, patientId, tokenNumber, status, chiefComplaint, priority, checkedInAt, calledInAt, readyAt, assignedDoctor, xrays[], outcome, consult{...}, transcript |
| **ConsultResult** | RecordDiagnosisSheet output, checkout | diagnosis, procedure, tooth, totalSittings, sittingDone, estimatedCost, medicines[], instructions, followUp, appointments[] |
| **Procedure** | useClinicalStore, patient Cases tab | id, treatmentPlanId, patientId, type, tooth, status, currentStage, stages[{name, completed, date}], estimatedVisits, completedVisits, estimatedCost, actualCost, labOrderId, startedAt, completedAt |
| **TreatmentPlan** | useClinicalStore, patient Cases tab | id, patientId, title, status, procedures[] |
| **Prescription** | useClinicalStore, checkout, patient billing | id, patientId, patientName, date, medicines[{name, dosage, frequency, duration, notes, slots{breakfast, lunch, dinner}}], instructions, followUpDays |
| **LabOrder** | useClinicalStore, finance/lab, patient Lab tab | id, patientId, patientName, procedureId, procedureType, toothNumber, labName, workDescription, sentDate, expectedReturnDate, actualReturnDate, status, costToClinic, chargedToPatient, notes, shade, impressionType |
| **Bill** | useClinicalStore, patient billing | id, patientId, patientName, items[{description, qty, unitPrice, total}], subtotal, discount, total, paid, outstanding, createdAt, status |
| **Payment** | Checkout, BillSheet | amount, method (Cash/UPI/Card), captured inline with bill |
| **Account** | useClinicalStore, finance page | id, date, type (income/expense), category, description, amount, patientId?, labOrderId? |
| **OdontogramRecord** | usePatientStore.teeth, Odontogram component | patientId, toothNumber (FDI), state (healthy/rct/crown/extraction/filling/implant/infection/scheduled) |
| **XRay** | CheckInSheet, patient detail | type (OPG/RVG/CBCT/Photo/Referral), tooth?, image (not implemented in demo) |
| **Medicine** | Prescriptions, ConsultResult | name, dosage, frequency (OD/BD/TDS/SOS/HS), duration, notes, uncertain, slots{breakfast, lunch, dinner} |
| **Appointment (Scheduled)** | Auto-created at checkout, patient overview | session, date, time, purpose |

---

## Section 3 — Backend Entity Inventory

### clinics
**Purpose:** Multi-tenant clinic entity.  
**Relationships:** has many `staff`, one `owner_staff_id`  
**Endpoints:** `GET /api/clinic`, `PATCH /api/clinic`, `POST /api/auth/create-clinic`, `POST /api/auth/lookup-clinic`, `POST /api/auth/join-clinic`  
**Columns:** id (UUID), name, city, owner_staff_id (FK→staff), join_code (CHAR 6, unique), display_id, created_at, updated_at

### staff
**Purpose:** Clinic members with roles.  
**Relationships:** belongs to `clinics`, optionally links to `dentists`  
**Endpoints:** `GET /api/staff`, `GET /api/staff/me`  
**Columns:** id, clinic_id, dentist_id, phone, name, role (doctor|receptionist), status (active|inactive), created_at, updated_at

### dentists (legacy)
**Purpose:** Original single-doctor records pre-multi-clinic migration.  
**Relationships:** references from `staff.dentist_id`  
**Endpoints:** Auth endpoints create/lookup dentist records  
**Columns:** id, phone, name, clinic_name, created_at, updated_at

### patients
**Purpose:** Patient master records, clinic-scoped.  
**Relationships:** belongs to `clinics`, `dentists`; has many `visits`, `appointments`, `xrays`, `prescriptions`, `treatment_plans`  
**Endpoints:** Full CRUD + case-sheet, tooth-history, xrays, prescriptions  
**Columns:** id, dentist_id, clinic_id, name, phone, age, gender (M|F|Other), medical_conditions (TEXT), allergies (TEXT), clinical_flags (TEXT), is_deleted, created_at, updated_at

### visits
**Purpose:** Clinical visit records with audio transcripts.  
**Relationships:** belongs to `patients`, `dentists`, `clinics`; has many `visit_notes`  
**Endpoints:** `GET /api/visits`, `POST /api/visits`, `GET /api/visits/:id`, `PUT /api/visits/:id`  
**Columns:** id, patient_id, dentist_id, clinic_id, procedure_name, tooth_number, status (completed|in_progress|pending), raw_transcript, notes, medications, next_steps, follow_up_date, follow_up_done, visit_date, cost, currency, audio_storage_path, audio_file_size_kb, audio_duration_sec, audio_uploaded_at, created_at, updated_at

### visit_notes
**Purpose:** AI-structured sub-notes per visit (multi-note support).  
**Relationships:** belongs to `visits`, `patients`, `dentists`  
**Endpoints:** `GET /api/visits/:id/notes`, `POST /api/visits/:id/notes`  
**Columns:** id, visit_id, patient_id, dentist_id, note_number, raw_transcript, structured_note (JSONB), procedure_name, tooth_number, status, notes, medications, next_steps, follow_up_date, cost, audio_storage_path, audio_file_size_kb, audio_duration_sec, audio_uploaded_at, created_at, updated_at

### appointments
**Purpose:** Scheduled future appointments.  
**Relationships:** belongs to `patients`, `dentists`, `clinics`  
**Endpoints:** `GET /api/appointments`, `GET /api/appointments/today`, `GET /api/appointments/upcoming`, `GET /api/appointments/booked-slots`, `POST /api/appointments`, `PUT /api/appointments/:id`  
**Columns:** id, patient_id, dentist_id, clinic_id, appointment_date, appointment_time, purpose, tooth_number, status (scheduled|completed|cancelled), created_at, updated_at

### treatment_plans
**Purpose:** Multi-sitting treatment course with cost tracking.  
**Relationships:** belongs to `patients`, `dentists`, `clinics`; has many `appointments`, `payments`  
**Endpoints:** `POST /api/treatment-plans`, `GET /api/treatment-plans/:id`, `PATCH /api/treatment-plans/:id`  
**Columns:** id, patient_id, dentist_id, clinic_id, diagnosis, procedure_name, total_sittings, completed_sittings, estimated_cost, collected_amount, pending_amount (computed), notes, status (active|completed|cancelled), start_date, expected_end_date, created_at, updated_at

### prescriptions
**Purpose:** Prescription records with AI-extracted medicines.  
**Relationships:** belongs to `patients`, `dentists`, `clinics`; optionally linked to `visits`, `visit_notes`, `queue_entries`  
**Endpoints:** `POST /api/prescriptions`, `GET /api/prescriptions/:id`, `GET /api/prescriptions/:id/pdf`  
**Columns:** id, patient_id, dentist_id, clinic_id, visit_id?, visit_note_id?, queue_entry_id?, raw_voice, medicines (JSONB: [{name, dose, frequency, duration, timing, instructions, meal_timing_slots}]), instructions, follow_up, created_at, updated_at

### xrays
**Purpose:** X-ray image metadata and Supabase Storage references.  
**Relationships:** belongs to `patients`, `dentists`, optionally `visits`  
**Endpoints:** `POST /api/xrays`, `GET /api/xrays/:id/url`, `DELETE /api/xrays/:id`  
**Columns:** id, patient_id, dentist_id, visit_id?, xray_type, storage_path, file_size_kb, date_taken, tooth_number, notes, remarks, created_at, updated_at

### queue_entries
**Purpose:** Daily clinic queue management with per-entry lifecycle.  
**Relationships:** belongs to `clinics`, `patients`; links to `treatment_plans`, `staff`  
**Endpoints:** Full queue CRUD + reorder + complete-consult + context  
**Columns:** id, clinic_id, patient_id, treatment_plan_id?, added_by (FK→staff), assigned_doctor (FK→staff), chief_complaint, visit_reason, priority (normal|high), queue_date, token_number, sort_order, status (waiting|in_consultation|ready_for_checkout|completed|cancelled), consultation_outcome ENUM, outcome_metadata (JSONB), notes, created_at, updated_at

### payments
**Purpose:** Payment recording against treatment plans.  
**Relationships:** belongs to `clinics`, `patients`, `treatment_plans`, `queue_entries`, `staff`  
**Endpoints:** `POST /api/payments`, `GET /api/payments/patient/:id`, `GET /api/payments/plan/:id`  
**Columns:** id, clinic_id, patient_id, treatment_plan_id?, queue_entry_id?, received_by (FK→staff), amount, payment_method (cash|card|upi|cheque), notes, payment_date, created_at, updated_at

### otp_codes
**Purpose:** OTP verification for phone-based auth.  
**Relationships:** standalone  
**Endpoints:** Used internally by auth controller  
**Columns:** id, phone, code, expires_at, used, created_at

---

## Section 4 — Compatibility Matrix

| Frontend Entity | Backend Table | Backend Endpoints | Coverage % | Status | Notes |
|-----------------|--------------|-------------------|-----------|--------|-------|
| Clinic | clinics | `/api/clinic`, auth endpoints | 50% | Needs Extension | Missing: specialty, working hours/days, slot duration, address |
| Staff / Doctor | staff | `/api/staff` | 80% | Reusable | Frontend hardcodes staff; backend is dynamic; initials not stored |
| Patient | patients | `/api/patients` full CRUD | 60% | Needs Extension | Missing: bloodGroup, boolean medical flags, status field, teeth/odontogram |
| Visit (Appointment booking) | appointments | `/api/appointments` | 55% | Needs Extension | Missing: arrived/no_show status, procedureId link, visitNumber/totalVisits, durationMinutes |
| Visit (Clinical record) | visits + visit_notes | `/api/visits` | 65% | Needs Extension | Frontend merges appointment+visit; backend separates them; missing: proceduresDone, nextSteps on appointment |
| QueueEntry | queue_entries | `/api/queue` full set | 75% | Reusable with Additions | Missing: calledInAt/readyAt timestamps as columns, xrays[] in queue entry |
| ConsultResult | queue_entries.outcome_metadata | `/api/queue/:id/complete-consult` | 70% | Reusable | JSONB outcome_metadata covers most fields; auto-creates plan+prescription |
| Procedure | MISSING | NONE | 0% | New Module Required | No procedures table; backend only has procedure_name as TEXT in treatment_plans |
| TreatmentPlan | treatment_plans | `/api/treatment-plans` | 65% | Needs Extension | Missing: title, procedures[] relationship, stage tracking |
| Prescription | prescriptions | `/api/prescriptions` + PDF | 90% | Reusable | followUp is text vs integer days; medicines JSONB matches well |
| Medicine | prescriptions.medicines (JSONB) | embedded in prescriptions | 95% | Reusable | Meal timing slots match; uncertain flag missing but minor |
| LabOrder | MISSING | NONE | 0% | New Module Required | No lab_orders table exists |
| Bill | MISSING | NONE | 0% | New Module Required | No bills table; payments table covers partial payment but not itemized billing |
| Payment | payments | `/api/payments` | 75% | Reusable | Method types match (cash/upi/card); not linked to itemized bill |
| Account (Finance) | MISSING | NONE | 0% | New Module Required | No general income/expense ledger |
| OdontogramRecord | MISSING | NONE | 0% | New Module Required | No teeth state storage; not on patients table |
| XRay | xrays | `/api/xrays` + Storage | 70% | Reusable | Backend more complete than frontend demo; frontend lacks actual upload |
| Diagnosis | treatment_plans.diagnosis | embedded | 70% | Reusable | Stored as TEXT; multi-diagnosis per patient needs plan per case |
| Appointment (auto-scheduled) | appointments | `/api/appointments` | 80% | Reusable | Auto-created in complete-consult; purpose maps to frontend's purpose field |

**Summary:**
- Fully Reusable (≥80%): Prescription, Medicine, XRay, Staff, Appointment (auto), Payment
- Needs Extension (40–79%): Clinic, Patient, Visit/Appointment, QueueEntry, ConsultResult, TreatmentPlan, Diagnosis
- New Module Required (0%): Procedure, LabOrder, Bill, Account/Ledger, OdontogramRecord

---

## Section 5 — Endpoint Mapping

### Home Dashboard (`app/page.jsx`)

| Required Data | Frontend Source | Backend API | Gap |
|--------------|----------------|-------------|-----|
| Today's appointments | useVisitStore (seed data) | `GET /api/appointments/today` | Wire frontend to API |
| Queue status counts | useQueueStore | `GET /api/queue` | Wire frontend to API |
| Continuing treatments | useClinicalStore.procedures | No endpoint for procedure list | Missing endpoint |
| Recent patients | usePatientStore | `GET /api/patients` (filter recent) | Partially supported |

### Patient List (`app/patients/page.jsx`)

| Required Data | Frontend Source | Backend API | Gap |
|--------------|----------------|-------------|-----|
| Patient list + search | usePatientStore | `GET /api/patients?search=` | Fully supported |
| Filter by status | usePatientStore filter | Not queryable | Missing filter param |

### Patient Profile (`app/patients/[id]/page.jsx`)

| Required Data | Frontend Source | Backend API | Gap |
|--------------|----------------|-------------|-----|
| Patient detail | usePatientStore.find | `GET /api/patients/:id` | Fully supported |
| Treatment history | useClinicalStore.procedures | `GET /api/patients/:id/treatment-plans` | Partial — no procedures table |
| Odontogram teeth state | patient.teeth object | No endpoint | Missing entirely |
| Lab orders | useClinicalStore.labOrders | No endpoint | Missing entirely |
| Billing + prescriptions | useClinicalStore | `GET /api/patients/:id/prescriptions` | Prescriptions supported; bills missing |
| X-ray history | implicit | `GET /api/patients/:id/xrays` | Fully supported |

### Consultation Screen (`app/consultation/page.jsx`)

| Required Action | Frontend | Backend API | Gap |
|-----------------|----------|-------------|-----|
| Get queue | useQueueStore | `GET /api/queue` | Wire frontend |
| Call in patient | useQueueStore.callIn | `PATCH /api/queue/:id` (status→in_consultation) | Wire frontend |
| Get patient context | hardcoded consult view | `GET /api/queue/:id/context` | Fully supported — use it |
| Voice record → transcribe | setTimeout mock | `POST /api/ai/transcribe` (Sarvam) | Wire frontend |
| Transcript → structured note | SAMPLE_EXTRACTION mock | `POST /api/ai/generate-note` (Gemini) | Wire frontend |
| Save consult + complete | useQueueStore.completeConsult | `POST /api/queue/:id/complete-consult` | Wire frontend |

### Reception Queue (`app/reception/page.jsx`)

| Required Action | Frontend | Backend API | Gap |
|-----------------|----------|-------------|-----|
| View queue | useQueueStore | `GET /api/queue` | Wire frontend |
| Check in patient | CheckInSheet form | `POST /api/queue` | Wire frontend |
| Complaint extraction | setTimeout mock | `POST /api/ai/extract-complaint` | Wire frontend |
| Upload xrays at check-in | toggle only (no upload) | `POST /api/xrays` | Missing frontend upload + link to queue |
| Reorder queue | not implemented | `PATCH /api/queue/:id/reorder` | Frontend missing drag-to-reorder |
| Checkout redirect | useQueueStore.checkout | `POST /api/payments` + status update | Wire frontend |

### Checkout Screen (`app/checkout/[id]/page.jsx`)

| Required Action | Frontend | Backend API | Gap |
|-----------------|----------|-------------|-----|
| Load consult summary | useQueueStore find | `GET /api/queue/:id/context` | Wire frontend |
| Show prescription | useClinicalStore | `GET /api/prescriptions/:id` | Wire frontend |
| Record payment | inline form | `POST /api/payments` | Wire frontend |
| Create itemized bill | BillSheet items[] | No billing endpoint | Missing entirely |
| Finalize checkout | useQueueStore.checkout | `PATCH /api/queue/:id` (status→completed) | Wire frontend |

### Schedule (`app/schedule/page.jsx`)

| Required Data | Frontend | Backend API | Gap |
|--------------|----------|-------------|-----|
| Week appointments | useVisitStore | `GET /api/appointments` | Wire frontend |
| Booked slots | not queried | `GET /api/appointments/booked-slots` | Available, use it |
| New appointment | NewVisitSheet | `POST /api/appointments` | Wire frontend |

### Finance (`app/finance/page.jsx`)

| Required Data | Frontend | Backend API | Gap |
|--------------|----------|-------------|-----|
| Bills list | useClinicalStore.bills | No bills endpoint | Missing |
| Payments | useClinicalStore.bills.paid | `GET /api/payments/patient/:id` | Partial |
| Lab orders | useClinicalStore.labOrders | No lab endpoint | Missing |
| Account entries | useClinicalStore.clinicAccounts | No ledger endpoint | Missing |

### AI Voice Endpoints (all screens with mic)

| Screen | Action | Backend API | Status |
|--------|--------|-------------|--------|
| RecordDiagnosisSheet | Voice → transcribe | `POST /api/ai/transcribe` | Exists, wire it |
| RecordDiagnosisSheet | Transcript → note | `POST /api/ai/generate-note` | Exists, wire it |
| NewPatientSheet | Voice patient details | `POST /api/ai/extract-complaint` | Exists, wire it |
| CheckInSheet (complaint) | Voice complaint | `POST /api/ai/extract-complaint` | Exists, wire it |
| PrescriptionSheet | Dictate medicines | `POST /api/prescriptions` (rawVoice) | Exists, wire it |
| AppointmentClient notes | Voice visit notes | `POST /api/visits` + `POST /api/ai/transcribe` | Exists, wire it |

---

## Section 6 — Database Gap Analysis

### patients table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| blood_group | Missing | TEXT (O+, A+, B-, etc.) | Low — add column |
| has_diabetes | Missing (bundled in medical_conditions TEXT) | BOOLEAN | Low — add column |
| has_hypertension | Missing | BOOLEAN | Low — add column |
| has_heart_condition | Missing | BOOLEAN | Low — add column |
| is_pregnant | Missing | BOOLEAN | Low — add column |
| is_on_blood_thinners | Missing | BOOLEAN | Low — add column |
| current_medications | Missing | TEXT[] or JSONB | Low — add column |
| allergies | TEXT (flat) | TEXT[] or JSONB | Medium — type change |
| status | Missing | ENUM (new/current/completed) | Low — add column |
| chief_complaint | Missing | TEXT | Low — add column |
| teeth | Missing | JSONB ({ "36": "rct", ... }) | Low — add JSONB column |
| gender enum | M/F/Other | Male/Female/Other (frontend uses full words) | Low — update enum or map in application layer |

### appointments table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| status values | scheduled/completed/cancelled | + arrived, no_show | Low — alter enum |
| duration_minutes | Missing | INTEGER | Low — add column |
| procedure_id | Missing | FK → procedures (future table) | Medium — depends on procedures table |
| visit_number | Missing | INTEGER | Low — add column |
| total_visits | Missing | INTEGER | Low — add column |

### queue_entries table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| called_in_at | Missing (only created_at) | TIMESTAMP | Low — add column |
| ready_at | Missing | TIMESTAMP | Low — add column |
| checked_in_at | created_at approximates | TIMESTAMP explicit field | Low — add column |
| xrays | Missing | JSONB ([{type, tooth}]) | Low — add JSONB column |
| priority values | normal/high | normal/urgent (rename) | Low — update enum |

### treatment_plans table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| title | Missing (has diagnosis instead) | TEXT | Low — add column |
| procedures[] | Missing | Relation to procedures table | High — requires new table |

### clinics table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| specialty | Missing | TEXT | Low — add column |
| address | Missing | TEXT | Low — add column |
| working_hours | Missing | JSONB ({days[], open, close, slot}) | Low — add JSONB |

### prescriptions table

| Column State | Current | Required | Migration Complexity |
|-------------|---------|----------|---------------------|
| follow_up_days | follow_up is TEXT | INTEGER (number of days) | Low — add column or rename |
| medicine.uncertain | Missing in JSONB schema | boolean field in medicines array | Low — JSONB is flexible |

### NEW TABLES REQUIRED

#### procedures (new)
```sql
id                UUID        PRIMARY KEY
treatment_plan_id UUID        FK → treatment_plans
patient_id        UUID        FK → patients
clinic_id         UUID        FK → clinics
type              TEXT        -- RCT/Extraction/Scaling/Crown/Implant/Filling/Orthodontics
tooth_number      VARCHAR
status            ENUM        -- planned/in_progress/completed
current_stage_index INTEGER
stages            JSONB       -- [{name, completed, date, notes}]
estimated_visits  INTEGER
completed_visits  INTEGER
estimated_cost    DECIMAL
actual_cost       DECIMAL
lab_order_id      UUID        FK → lab_orders (nullable)
started_at        DATE
completed_at      DATE        -- nullable
created_at        TIMESTAMP
updated_at        TIMESTAMP
```
**Complexity:** Medium — core new entity with stage tracking logic

#### lab_orders (new)
```sql
id                    UUID        PRIMARY KEY
patient_id            UUID        FK → patients
clinic_id             UUID        FK → clinics
procedure_id          UUID        FK → procedures (nullable)
procedure_type        TEXT
tooth_number          VARCHAR
lab_name              TEXT
work_description      TEXT
sent_date             DATE
expected_return_date  DATE
actual_return_date    DATE        -- nullable
status                ENUM        -- pending/sent/received/completed
cost_to_clinic        DECIMAL
charged_to_patient    DECIMAL
notes                 TEXT
shade                 TEXT
impression_type       TEXT
created_at            TIMESTAMP
updated_at            TIMESTAMP
```
**Complexity:** Low — simple CRUD entity

#### bills (new)
```sql
id              UUID        PRIMARY KEY
patient_id      UUID        FK → patients
clinic_id       UUID        FK → clinics
queue_entry_id  UUID        FK → queue_entries (nullable)
items           JSONB       -- [{description, quantity, unit_price, total}]
subtotal        DECIMAL
discount        DECIMAL
total           DECIMAL
paid            DECIMAL
outstanding     DECIMAL     -- computed: total - paid
status          ENUM        -- paid/partial/unpaid
created_at      TIMESTAMP
updated_at      TIMESTAMP
```
**Complexity:** Low — itemized billing layer on top of payments

#### clinic_accounts (new ledger)
```sql
id           UUID    PRIMARY KEY
clinic_id    UUID    FK → clinics
date         DATE
type         ENUM    -- income/expense
category     TEXT
description  TEXT
amount       DECIMAL
patient_id   UUID    FK (nullable)
lab_order_id UUID    FK (nullable)
created_at   TIMESTAMP
```
**Complexity:** Low — general ledger entries

---

## Section 7 — Authentication Analysis

### Current Backend Auth
- **Mechanism:** Phone OTP → JWT (30-day expiry)
- **JWT Payload:** `{ dentistId, staffId, clinicId, role }`
- **Backward Compatibility:** Old tokens (dentistId only) still work; staff auto-lookup
- **Rate Limiting:** 100 req / 15 min (global, not per-user)
- **Dev Mode:** `USE_DEV_OTP=true` + `DEV_OTP=123456` for testing

### Current Frontend Auth
- **No real authentication.** `useAppStore` stores `role` in memory.
- `FlowGuard` redirects based on Zustand state: `started → role → doctorSetupDone`
- `signOut()` clears local state only
- No JWT, no token storage, no session persistence

### Role Support Analysis

| Role | Backend Support | Frontend Support | Gap |
|------|----------------|-----------------|-----|
| Doctor | Full (role='doctor' in JWT) | Hardcoded as Dr. Arjun Mehta | Replace hardcoded with API |
| Receptionist | Full (role='receptionist') | Hardcoded as Lakshmi Iyer | Replace hardcoded with API |
| Admin | Not implemented | Not implemented | Not needed for MVP |
| Multi-clinic | Full (clinicId in JWT, join_code flow) | Not implemented | Need onboarding to call API |

### Multi-Clinic Architecture
- Backend fully supports: create-clinic, lookup-clinic, join-clinic flows
- Staff scoped by clinic_id on all queries
- Frontend doctor setup (`/doctor/setup`) maps directly to `POST /api/auth/create-clinic` flow
- Receptionist join flow would need `POST /api/auth/join-clinic` with join_code

### Recommendations
1. **Replace FlowGuard logic** with JWT-aware guard: check `localStorage` for token, verify via `GET /api/auth/me`
2. **Wire `/doctor/setup`** to `POST /api/auth/create-clinic`
3. **Wire `/roles`** screen to OTP auth: `POST /api/auth/send-otp` → `POST /api/auth/verify-otp`
4. **Store JWT** in `localStorage` (or Capacitor Preferences for mobile)
5. **Replace hardcoded STAFF** constants with data from `GET /api/staff/me` and `GET /api/staff`
6. Role-based rendering already works in frontend via `useAppStore.role` — sync this with JWT `role` field after login

---

## Section 8 — Realtime Analysis

### Frontend Features Requiring Realtime

| Feature | Screen | Current Frontend | Realtime Need |
|---------|--------|-----------------|---------------|
| Queue position updates | reception, consultation | Zustand (instant, in-memory) | High — multi-device clinic |
| New patient check-in appearing | consultation (doctor sees queue) | Not possible (single device) | High |
| Patient called in (receptionist → doctor sync) | consultation ↔ reception | Not possible | High |
| Ready-for-checkout status | reception | Not possible | High |
| Appointment changes | schedule | Not possible | Medium |
| Payment confirmation | checkout | Not possible | Medium |
| Consultation progress | reception in-consult indicator | Hardcoded "live" indicator | High |

### Supabase Realtime Assessment
The backend uses Supabase PostgreSQL — **Supabase Realtime is available at zero additional infrastructure cost.**

Supabase Realtime supports:
- `channel.on('postgres_changes', ...)` — triggers on INSERT/UPDATE/DELETE on any table
- Row-level filtering by `clinic_id` for proper isolation

### Recommended Realtime Channels

| Channel | Table | Events | Consumers |
|---------|-------|--------|-----------|
| `queue:{clinic_id}` | queue_entries | INSERT, UPDATE | Reception, Consultation |
| `appointments:{clinic_id}` | appointments | INSERT, UPDATE | Schedule, Home |
| `patients:{clinic_id}` | patients | INSERT | Patient list |

### Backend Changes Needed for Realtime
The Express.js backend **does not need changes** for Supabase Realtime. The frontend connects directly to Supabase using the anon key with Row Level Security (RLS) policies. The Express backend handles mutations; realtime pushes the updates back.

Required: Enable Supabase Realtime on `queue_entries` and `appointments` tables in the Supabase dashboard.

---

## Section 9 — Storage Analysis

### Current Backend Storage
- **Provider:** Supabase Storage
- **Buckets:** `voice-notes` (audio), `xrays` (images)
- **Audio naming:** `{dentist_id}/{patient_id}/{timestamp}`
- **Xray naming:** `{dentist_id}/{patient_id}/{xray_type}_{timestamp}`
- **Signed URLs:** 1-hour expiry via `GET /api/xrays/:id/url`
- **Upload limits:** 20MB for xrays, 25MB for audio
- **Cleanup:** Audio deleted after 18 months (background job)
- **Endpoints:** `POST /api/xrays` (multipart), `GET /api/xrays/:id/url`, `DELETE /api/xrays/:id`

### Frontend Storage Requirements

| Asset | Frontend Current | Backend Support | Gap |
|-------|-----------------|----------------|-----|
| X-Ray images (OPG, RVG, CBCT) | Type selection toggle only, no upload | Full (`POST /api/xrays`, Supabase bucket) | Frontend needs file input + upload |
| Patient photos | Not implemented | Not implemented | Could reuse xrays bucket with type='Photo' |
| Voice recordings | Not uploaded (mock delay) | Full (voice-notes bucket) | Frontend needs MediaRecorder → blob → POST |
| Lab reports (PDF) | Not implemented | Not implemented | Need lab_orders table + storage path column |
| Prescriptions (PDF) | Print/share button (no PDF) | Full (PDFKit, `GET /api/prescriptions/:id/pdf`) | Wire frontend to existing PDF endpoint |
| Referral letters | Not implemented | Not implemented | Future — attach to xrays with type='Referral' |

### Storage Gaps
1. **Frontend has no file upload implementation** — all camera/file buttons are UI stubs
2. **Lab reports** not in any bucket — need storage_path column on lab_orders (new table)
3. **Patient photos** — can reuse xrays bucket with type='Photo' per existing xray_type enum
4. **Prescription PDF** is implemented in backend (PDFKit) — frontend just needs to open `GET /api/prescriptions/:id/pdf` URL

---

## Section 10 — AI Integration Analysis

### Where AI Is Required in Frontend

| Location | Sheet/Screen | Trigger | Input | Required Output |
|----------|-------------|---------|-------|----------------|
| Patient creation | NewPatientSheet | Voice button "Say patient details" | Voice recording | age, gender, blood_group, conditions, allergies, medications |
| Check-in complaint | CheckInSheet Step 1 | "Dictate" button | Voice recording | chiefComplaint text |
| Consultation diagnosis | RecordDiagnosisSheet | Mic button (dominant flow) | Voice recording | diagnosis, procedure, tooth, sittings, cost, medicines[], instructions, followUp, appointments[] |
| Visit notes dictation | AppointmentClient | Mic on "Visit notes" field | Voice recording | notes text |
| End visit summary | EndVisitSheet | Large mic button | Voice recording | proceduresDone text, nextSteps text |
| Prescription dictation | PrescriptionSheet | "Dictate" button | Voice recording | medicines[] with dose/frequency/duration |
| Clinical notes | EditPatientSheet fields | Mic icon on Field component | Voice recording | field text |

### AI Processing Pipeline (per the backend)
```
Recording (browser MediaRecorder)
→ POST /api/ai/transcribe (Sarvam AI, Indian accent STT)
→ raw transcript text
→ POST /api/ai/generate-note (Gemini 2.5 Flash Lite)
→ structured JSON (procedure, tooth, cost, medicines, follow_up, sittings)
→ auto-creates: treatment_plan + appointments + prescription
   (POST /api/queue/:id/complete-consult — single atomic operation)
```

### All AI Integration Points

| Integration | Type | Backend Service | Status |
|------------|------|----------------|--------|
| Speech-to-text | Sarvam AI | `/api/ai/transcribe` | Backend ready |
| Note structuring | Gemini LLM | `/api/ai/generate-note` | Backend ready |
| Complaint extraction | Gemini LLM | `/api/ai/extract-complaint` | Backend ready |
| Prescription from voice | Gemini LLM | `POST /api/prescriptions` (rawVoice param) | Backend ready |
| Medicine uncertainty flagging | LLM output field | `uncertain: boolean` in medicines JSONB | Backend ready |
| Follow-up scheduling | Auto in complete-consult | Inside `complete-consult` endpoint | Backend ready |
| PDF generation | PDFKit | `GET /api/prescriptions/:id/pdf` | Backend ready |

**Conclusion: All AI features are already implemented in the backend. The frontend only needs to stop simulating and start calling real endpoints.**

---

## Section 11 — Sarvam AI Integration Plan

### Where Speech-to-Text Should Be Used

| Screen | Trigger | Language Support | Notes |
|--------|---------|-----------------|-------|
| RecordDiagnosisSheet | Mic button in consultation | Tamil + English (code-switch) | Primary use case — longest recording |
| NewPatientSheet | "Say patient details" | Tamil + English | Short utterance: name, age, conditions |
| CheckInSheet | "Dictate" complaint | Tamil + English | 1-2 sentence complaint |
| PrescriptionSheet | Dictate medicines | English preferred | Medicine names are English |
| EndVisitSheet | Large center mic | Tamil + English | Visit summary dictation |
| AppointmentClient | Field mic icon | Tamil + English | Notes field dictation |

### Backend Services Required (all exist)
- `POST /api/ai/transcribe` — receives `.m4a`/`.wav`/`.mp3` audio, returns `{ transcript, storagePath }`
- `POST /api/ai/generate-note` — receives `{ transcript }`, returns structured clinical JSON
- `POST /api/ai/extract-complaint` — receives `{ transcript }`, returns `{ chiefComplaint }`

### Frontend Architecture Required (not yet built)
1. **MediaRecorder** — capture audio from device microphone (browser Web API)
2. **Blob → FormData** — send audio as multipart to `/api/ai/transcribe`
3. **Auth header** — all AI endpoints require JWT Bearer token
4. **Loading state** — keep existing animated loading dots (they display during processing)
5. **Error handling** — backend has mock fallback if Sarvam is unavailable

### Data Storage
- Voice recordings stored in Supabase `voice-notes` bucket by backend (on transcribe call)
- Transcripts stored in `visits.raw_transcript` or `queue_entries.outcome_metadata`
- Structured notes stored in `visit_notes.structured_note` (JSONB)
- Prescriptions extracted and stored in `prescriptions.medicines` (JSONB)

---

## Section 12 — LLM Processing Opportunities

### 1. Consultation Note Structuring (in use, Gemini)
- **Input:** Raw Tamil/English voice transcript from doctor
- **Output:** `{ procedure_name, tooth_number, status, cost, total_sittings, medications[], follow_up_date, notes, next_steps }`
- **Human Approval:** Yes — doctor reviews on RecordDiagnosisSheet before confirming
- **Storage Destination:** `visit_notes.structured_note` (JSONB) + creates `treatment_plan` + `prescription`

### 2. Chief Complaint Extraction (in use, Gemini)
- **Input:** Patient's spoken complaint (Tamil/English mix)
- **Output:** Clean English chief complaint string
- **Human Approval:** Optional — receptionist can edit before confirming
- **Storage Destination:** `queue_entries.chief_complaint`

### 3. Prescription Drafting from Voice (in use, Gemini)
- **Input:** Doctor's spoken prescription (medicine names, dosages, frequencies)
- **Output:** `{ medicines: [{name, dose, frequency, duration, meal_timing_slots}], instructions, follow_up }`
- **Human Approval:** Yes — PrescriptionSheet shows result for review/edit
- **Storage Destination:** `prescriptions.medicines` (JSONB)

### 4. Patient Detail Extraction (potential — no backend endpoint yet)
- **Input:** "Patient is a 45-year-old male, diabetic, allergic to penicillin, on metformin"
- **Output:** `{ age: 45, gender: 'Male', has_diabetes: true, allergies: ['penicillin'], current_medications: ['metformin'] }`
- **Human Approval:** Yes — NewPatientSheet shows result for review
- **Storage Destination:** `patients` table fields
- **Gap:** No dedicated endpoint — needs new route or fold into extract-complaint

### 5. Diagnosis Code Extraction (future opportunity)
- **Input:** Doctor's diagnosis text from consultation note
- **Output:** ICD-10 or dental procedure code suggestions
- **Human Approval:** Yes — doctor selects from suggestions
- **Storage Destination:** `treatment_plans.diagnosis` or new `diagnosis_codes` column
- **Gap:** Not implemented anywhere — future enhancement

### 6. Treatment Recommendation (future opportunity)
- **Input:** Patient history + chief complaint + xray types present + medical flags
- **Output:** Suggested treatment options with estimated sittings and costs
- **Human Approval:** Yes — doctor selects recommendation
- **Storage Destination:** `treatment_plans`
- **Gap:** Not in backend; requires patient context aggregation endpoint

### 7. Follow-up Note Generation (partial, auto in complete-consult)
- **Input:** Consultation transcript + treatment plan
- **Output:** Patient-friendly SMS/WhatsApp follow-up message
- **Human Approval:** Optional — could be sent automatically
- **Storage Destination:** Not persisted (send only)
- **Gap:** Frontend has WhatsApp button in AppointmentClient; no message generation yet

---

## Section 13 — Migration Strategy

### Option A: Extend Existing Backend (Express + Supabase)

**What it means:** Keep Express.js API as-is. Add missing tables (procedures, lab_orders, bills, clinic_accounts). Extend existing tables (patients, appointments, queue_entries, clinics). Wire frontend to backend via REST + Auth.

**Pros:**
- Backend is already functional and production-ready
- Auth (OTP/JWT), AI pipeline (Sarvam/Gemini), PDF generation, storage all work
- No refactoring of existing working endpoints
- All new endpoints follow established patterns
- Lower risk — proven foundation

**Cons:**
- Express adds a network hop vs direct Supabase from frontend
- No built-in realtime — requires adding Supabase client to frontend separately
- Two layers to maintain (Express + Supabase)
- Rate limiting (100 req/15min) may need adjustment for queue polling

**Complexity:** Medium  
**Risk:** Low  
**Estimated Development Effort:** 3–4 weeks

---

### Option B: Hybrid Migration (Express for AI/PDF/Auth + Supabase Direct for Data)

**What it means:** Keep Express only for: auth (OTP/JWT), AI endpoints (Sarvam/Gemini), PDF generation, and complex business logic (complete-consult atomic operation). Move all simple CRUD (patients, visits, appointments, queue reads) to direct Supabase client calls from frontend. Add Supabase Realtime for queue.

**Pros:**
- Best of both: realtime queue, AI pipeline retained, simpler data operations
- Reduces REST round trips for read-heavy screens (patient list, schedule)
- Supabase Realtime works natively without polling
- Frontend was designed expecting Supabase-style patterns
- Scales better — Supabase handles read replicas, RLS, caching

**Cons:**
- Two auth mechanisms: JWT (Express endpoints) + Supabase anon key (direct queries)
- Requires Row Level Security (RLS) policies on all Supabase tables
- Frontend manages two different clients
- Business rule enforcement must be in Supabase RLS or backend triggers

**Complexity:** Medium-High  
**Risk:** Medium (RLS policies are easy to misconfigure)  
**Estimated Development Effort:** 4–5 weeks

---

### Option C: Rebuild Backend Using Supabase (Remove Express entirely)

**What it means:** Replace Express.js with Supabase Edge Functions (Deno) for AI + PDF endpoints. Use Supabase for everything: auth (phone OTP via Supabase Auth), database, storage, realtime, edge functions.

**Pros:**
- Single platform — no separate server to deploy/monitor
- Supabase Auth supports phone OTP natively (replaces custom otp_codes table)
- Realtime is native
- Edge Functions handle Sarvam/Gemini calls
- No Express server infrastructure cost

**Cons:**
- Complete rebuild of all backend logic in a different runtime (Deno)
- Loss of working Sarvam/Gemini integration — must rebuild in Edge Functions
- Loss of PDFKit — must use different PDF approach
- Supabase Edge Functions have cold start latency
- Audio cleanup job needs to move to pg_cron or scheduled edge function
- High risk of introducing bugs in mature, working code
- Significant development cost with no clear architectural benefit over Option B

**Complexity:** Very High  
**Risk:** High  
**Estimated Development Effort:** 6–8 weeks

---

### Recommended Choice: **Option B — Hybrid Migration**

The existing Express backend has genuine value that should be preserved:
- Working Sarvam AI transcription pipeline
- Gemini note structuring with fallbacks
- PDFKit prescription PDF generation
- OTP authentication system
- Atomic `complete-consult` endpoint (creates plan + prescription + appointments in one transaction)
- Audio cleanup background job

These are non-trivial to rebuild. The Express backend handles the hard parts well.

The frontend clearly expects direct Supabase access for realtime (the app is designed for a clinic with two screens — reception and doctor — that must sync in real time). Adding polling on top of Express is the wrong architecture here.

The hybrid approach captures the best of both.

---

## Section 14 — Final Recommendation

### Brutally Honest Assessment

**The existing backend is ~70% reusable. It should not be replaced.**

The backend's AI pipeline alone (Sarvam transcription → Gemini structuring → atomic treatment plan + prescription creation) represents significant engineering work that is production-ready and well-designed. The OTP auth, JWT middleware, Supabase storage integration, PDF generation, and background cleanup job are all solid.

**The frontend is a polished UI prototype with zero backend integration.** Every API call must be built. Every voice feature must be wired. The authentication system must be replaced entirely. This is the primary integration work — not a rebuild, but a connection.

---

### What Should Remain as Express (Keep)

| Endpoint Group | Reason |
|---------------|--------|
| `POST /api/auth/*` | OTP, JWT, clinic create/join — complex auth logic |
| `POST /api/ai/*` | Sarvam STT, Gemini structuring, complaint extraction |
| `GET /api/prescriptions/:id/pdf` | PDFKit generation |
| `POST /api/queue/:id/complete-consult` | Atomic multi-table transaction — critical |
| `POST /api/payments` | Payment recording with treatment plan sync |

---

### What Should Move to Direct Supabase (Frontend Client)

| Operation | Reason |
|-----------|--------|
| `GET /api/patients` | Simple list — no business logic |
| `GET /api/patients/:id` | Detail read — no business logic |
| `GET /api/appointments` | Schedule view — direct query |
| `GET /api/queue` | Replace with Supabase Realtime subscription |
| `GET /api/analytics/dashboard` | Direct aggregation query |

---

### What Must Be Built New (Backend)

| Priority | Task |
|---------|------|
| P0 | `procedures` table + CRUD endpoints |
| P0 | `lab_orders` table + CRUD endpoints |
| P0 | `bills` table + itemized billing endpoints |
| P1 | `clinic_accounts` ledger table + endpoints |
| P1 | Patient schema extension (boolean flags, bloodGroup, teeth JSONB, status) |
| P1 | Appointment schema extension (arrived/no_show status, durationMinutes, visitNumber) |
| P1 | Queue schema extension (calledInAt, readyAt, xrays JSONB) |
| P1 | Clinic schema extension (specialty, working_hours, address) |
| P2 | Patient extraction endpoint for voice patient creation |
| P2 | Supabase Realtime enablement on queue_entries and appointments tables |

---

### What Must Be Built New (Frontend)

| Priority | Task |
|---------|------|
| P0 | Real auth: OTP phone input → JWT storage → FlowGuard JWT check |
| P0 | MediaRecorder integration in all VoiceSheet components |
| P0 | Wire RecordDiagnosisSheet to `/api/ai/transcribe` + `/api/ai/generate-note` |
| P0 | Wire CheckInSheet to `POST /api/queue` + `/api/ai/extract-complaint` |
| P0 | Replace useQueueStore with Supabase Realtime channel |
| P1 | Replace all usePatientStore CRUD with API calls |
| P1 | Replace all useClinicalStore CRUD with API calls |
| P1 | Wire checkout to `/api/payments` + `/api/bills` |
| P1 | File upload for xrays in CheckInSheet |
| P1 | Open prescription PDF from `/api/prescriptions/:id/pdf` |
| P2 | Replace hardcoded STAFF with `/api/staff/me` |
| P2 | Wire DoctorSetup to create-clinic API |
| P2 | Wire Schedule to appointments API with booked-slots validation |

---

### Estimated Integration Effort (Hybrid Approach)

| Work Stream | Effort |
|------------|--------|
| Backend schema extensions + new tables | 1 week |
| Backend new endpoints (procedures, lab, bills) | 1.5 weeks |
| Frontend auth integration | 3 days |
| Frontend voice/AI wiring | 4 days |
| Frontend data layer (replace Zustand seed with API) | 1 week |
| Supabase Realtime queue integration | 2 days |
| Frontend file upload (xrays) | 2 days |
| Testing + edge cases | 1 week |
| **Total** | **~6 weeks** |

---

### Bottom Line

The existing backend is a strong foundation built for this exact domain. The AI pipeline, auth system, and queue management logic are production-grade and should be preserved.

The frontend is beautifully designed with a clear, complete UI that maps well to the backend. The primary work is wiring — replacing in-memory Zustand data with real API calls, replacing `setTimeout` voice simulation with the already-built Sarvam/Gemini pipeline, and replacing local FlowGuard state with JWT-aware authentication.

**Do not rebuild the backend. Do not discard the frontend. Wire them together**, extend the schema for the five missing entities (procedures, lab orders, bills, clinic accounts, odontogram), and the system will be production-ready in approximately six weeks.
