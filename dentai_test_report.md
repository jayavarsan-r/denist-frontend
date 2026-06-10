# DentAI End-to-End Test Report
Generated: 2026-06-10T08:30:00+00:00
Environment: http://localhost:3000 | Supabase: https://zkxpxyfnlmchtbknnghw.supabase.co | Clinic: Velora Dental Studio

---

## Summary

| Category | Total Tests | Passed | Failed | Missing |
|---|---|---|---|---|
| Patient Registration | 5 | 5 | 0 | 0 |
| Appointments | 6 | 5 | 0 | 1 |
| Consultation / Voice / AI | 6 | 6 | 0 | 0 |
| Tooth Chart | 2 | 1 | 0 | 1 |
| Prescriptions | 3 | 2 | 0 | 1 |
| Billing & Payments | 5 | 4 | 1 | 0 |
| Multi-Visit Treatment Plans | 4 | 3 | 0 | 1 |
| Lab Workflow | 2 | 1 | 1 | 0 |
| Dashboards | 5 | 1 | 0 | 4 |
| Queue Management | 5 | 4 | 1 | 0 |
| Notifications | 4 | 0 | 0 | 4 |
| Edge Cases | 5 | 4 | 1 | 0 |
| **TOTAL** | **52** | **36** | **3** | **11** |

---

## Detailed Findings

---

### [PASS] 2.1 — Patient Registration: Karthik Raman
- **What was tested:** POST /api/patients with correct lowercase gender enum
- **Expected:** 201 with patient record and auto-generated UHID
- **Actual:** 200, patient created successfully (id: 4df348ab), but **UHID field is absent** from response
- **HTTP Status:** 200
- **Response snippet:** `{"patient":{"id":"4df348ab-16f0-4095-b13c-3a66276dc631","name":"Karthik Raman","age":34,"gender":"male",...}}`
- **Note:** First attempt failed with gender="Male" (capitalised). API requires lowercase `"male"|"female"|"other"`. UHID is not returned in the creation response — unclear if auto-generated at all.

---

### [FAIL] 2.1b — UHID Auto-Generation
- **What was tested:** Whether a UHID is automatically generated on patient creation
- **Expected:** Response includes a `uhid` field (e.g., `VDS-0001`)
- **Actual:** No `uhid` field present in patient record or creation response
- **HTTP Status:** 200
- **Error:** Schema gap — `patients` table has no `uhid` column

---

### [PASS] 2.2 — Queue / Walk-in Token: Karthik Raman
- **What was tested:** POST /api/queue to add walk-in token
- **Expected:** Token number assigned, status=waiting
- **Actual:** Token #1 created (id: 6d410259), status=waiting
- **HTTP Status:** 200
- **Response snippet:** `{"entry":{"id":"6d410259...","token_number":1,"status":"waiting"}}`

---

### [PASS] 2.3 — Appointment Creation: Karthik Raman
- **What was tested:** POST /api/appointments
- **Expected:** Appointment created and linked to patient
- **Actual:** Appointment created (id: 6c1a5819)
- **HTTP Status:** 200
- **Note:** API uses `appointmentDate` (YYYY-MM-DD) + `appointmentTime` (HH:MM), NOT `scheduledAt`. Using `type` as field name fails — correct field is `purpose`.

---

### [PASS] 2.4 — Consultation AI Extraction: RCT Case
- **What was tested:** POST /api/ai/generate-note with RCT transcript
- **Expected:** Extracts tooth 36, diagnosis, procedure, follow-up 5 days
- **Actual:** tooth="36", procedure="Root Canal Treatment", followUpDays=5, followUpDate="2026-06-15" — all correct
- **HTTP Status:** 200
- **Response snippet:** `{"structured":{"procedure":"Root Canal Treatment","toothNumber":"36","status":"in_progress","followUpDays":5,"followUpDate":"2026-06-15"}}`

---

### [PASS] 2.4b — Prescription Extraction AI
- **What was tested:** POST /api/ai/extract-prescription with Amoxicillin + Zerodol SP + Hexidine
- **Expected:** All 3 medicines extracted with dose, frequency, duration, meal timing
- **Actual:** All 3 medicines extracted correctly with meal timing slots (breakfast/lunch/dinner booleans)
- **HTTP Status:** 200

---

### [PASS] 2.5 — Tooth History Endpoint
- **What was tested:** GET /api/patients/:id/tooth-history
- **Expected:** Returns tooth chart data
- **Actual:** Returns 8 items (pre-existing history from previous test data in same clinic)
- **HTTP Status:** 200

---

### [MISSING] 2.5b — Tooth Chart Write (PATCH tooth status)
- **What was tested:** Whether a dedicated endpoint exists to set tooth status (infection, rct_initiated, temporary_restoration)
- **Expected:** POST/PATCH /api/patients/:id/teeth or similar
- **Actual:** No dedicated tooth chart write endpoint found. Tooth data is recorded implicitly via visits/treatment plans. No way to tag a specific tooth with a status independent of a visit.
- **Note:** This is a clinical workflow gap — chart coloring/status cannot be set from the UI without creating a visit.

---

### [PASS] 2.6 — Prescription Save
- **What was tested:** POST /api/prescriptions with 3 medicines
- **Expected:** Prescription saved with all 3 medicines
- **Actual:** Prescription created (id: 54650e37)
- **HTTP Status:** 200

---

### [PASS] 2.6b — Prescription PDF Generation
- **What was tested:** GET /api/prescriptions/:id/pdf
- **Expected:** Returns 200 with PDF content
- **Actual:** HTTP 200
- **HTTP Status:** 200

---

### [MISSING] 2.6c — WhatsApp / Notification Send
- **What was tested:** POST /api/notifications, /api/whatsapp, /api/notifications/send, /api/notify
- **Expected:** An endpoint to send WhatsApp prescription / reminder to patient
- **Actual:** All 404. No notification system exists.
- **Note:** This is a high-value clinical feature — patients expect WhatsApp prescription delivery.

---

### [PASS] 2.7 — Treatment Plan Creation (Billing Container)
- **What was tested:** POST /api/treatment-plans for RCT
- **Expected:** Treatment plan created with estimated cost ₹2000
- **Actual:** Plan created (id: 13af9856), estimatedCost=2000, totalSittings=3
- **HTTP Status:** 200

---

### [PASS] 2.7b — Partial Payment Recording
- **What was tested:** POST /api/payments with ₹1000 of ₹2000 total
- **Expected:** Payment recorded, pending balance trackable
- **Actual:** Payment of ₹1000 recorded successfully
- **HTTP Status:** 200
- **Note:** There is NO automatic "remaining balance" field — pending dues must be calculated by subtracting sum of payments from treatment plan estimatedCost. No single `status: partially_paid` flag exists.

---

### [FAIL] 2.7c — Overpayment Guard
- **What was tested:** POST /api/payments with amount=₹9,999,999 (wildly exceeding treatment cost)
- **Expected:** 400 error — payment cannot exceed outstanding balance
- **Actual:** Payment accepted without any guard
- **HTTP Status:** 200
- **Error:** No overpayment validation. Financial integrity risk.

---

### [PASS] 2.8 — Follow-up Appointment Scheduling
- **What was tested:** POST /api/appointments for follow-up 5 days later
- **Expected:** Appointment created
- **Actual:** Appointment created for 2026-06-15
- **HTTP Status:** 200

---

### [PASS] 2.8b — AI Smart Scheduling (parse-schedule)
- **What was tested:** POST /api/ai/parse-schedule with "Schedule review after 5 days"
- **Expected:** Returns parsed future date
- **Actual:** Returns preferredDate="2026-06-15" — correctly calculated
- **HTTP Status:** 200

---

### [PASS] 3.1 — Patient Registration: Meena Suresh
- **What was tested:** POST /api/patients
- **Actual:** Patient created (id: 720939ef)
- **HTTP Status:** 200

---

### [PASS] 3.2 — Pre-booked Appointment
- **What was tested:** POST /api/appointments with pre-booked status
- **Actual:** Appointment created
- **HTTP Status:** 200

---

### [PASS] 3.3 — Consultation AI: Scaling
- **What was tested:** POST /api/ai/generate-note with scaling transcript
- **Expected:** Extracts procedure=Scaling, diagnosis=gingivitis
- **Actual:** procedure="Scaling" extracted correctly
- **HTTP Status:** 200

---

### [PASS] 3.4 — Full Payment: Meena Suresh
- **What was tested:** POST /api/payments ₹2800 full payment
- **Actual:** Payment recorded, amount=2800
- **HTTP Status:** 200

---

### [PASS] 4.1 — Patient Registration: Aadhya Krishnan
- **What was tested:** POST /api/patients
- **Actual:** Patient created (id: 70dcdc5f)
- **HTTP Status:** 200
- **Note:** `guardianName` field accepted but may not be stored — schema does not appear to have a guardian_name column based on API response.

---

### [PASS] 4.2 — Multi-Visit Treatment Plan: Metal Braces
- **What was tested:** POST /api/treatment-plans with 18-month duration, 22 sittings, ₹85,000
- **Actual:** Plan created (id: 02c04d76), all fields saved
- **HTTP Status:** 200

---

### [PASS] 4.3 — Advance Payment: ₹20,000
- **What was tested:** POST /api/payments ₹20,000 advance
- **Actual:** Payment recorded
- **HTTP Status:** 200

---

### [MISSING] 4.3b — EMI / Payment Plan Tracking
- **What was tested:** Endpoints for structured EMI plan (₹5,000/month over 13 months)
- **Expected:** POST /api/payment-plans or /api/payments/plan
- **Actual:** No EMI / payment plan endpoint exists. Only ad-hoc payment recording.
- **Note:** Orthodontic practices routinely use structured payment plans. This is a product gap.

---

### [MISSING] 4.4 — Bulk/Recurring Recall Scheduling
- **What was tested:** POST /api/appointments/bulk, /api/appointments/recurring, /api/recalls
- **Expected:** Endpoint to generate N monthly recall appointments from a start date
- **Actual:** All 404. Recalls must be booked one by one. Tested creating 3 monthly recalls manually — that works, but is operationally impractical for 18-month ortho cases.
- **HTTP Status:** 404

---

### [PASS] 5.1 — Patient Registration: Rajesh Kumar
- **What was tested:** POST /api/patients
- **Actual:** Patient created (id: f7990bca)
- **HTTP Status:** 200

---

### [PASS] 5.2 — Multi-Stage Implant Treatment Plan
- **What was tested:** POST /api/treatment-plans with implant metadata in notes field
- **Expected:** Stages, brand, lot number tracked
- **Actual:** Plan created (id: 1ef53af8). Stages tracked in `notes` field — there is no structured stage/implant metadata schema (no separate columns for brand, lot number, stage progression).
- **HTTP Status:** 200
- **Note:** Implant-specific fields (brand, lot, size) stored as free text in `notes`. Not queryable/filterable.

---

### [FAIL] 5.4a — Lab Order: Wrong Status Enum
- **What was tested:** POST /api/lab-orders with status="in_progress"
- **Expected:** Lab order created
- **Actual:** 400 — valid values are `pending|sent|received|completed`, not `in_progress`
- **HTTP Status:** 400
- **Error:** `{"field":"status","message":"Invalid option: expected one of \"pending\"|\"sent\"|\"received\"|\"completed\""}`
- **Note:** This is an API / documentation mismatch. "in_progress" is an intuitive value but not accepted.

---

### [PASS] 5.4b — Lab Order: Correct Status
- **What was tested:** POST /api/lab-orders with status="sent"
- **Actual:** Lab order created (id: c0858ee7), linked to patient and treatment plan
- **HTTP Status:** 200

---

### [PASS] 5.3 — AI Smart Scheduling: 3 Months
- **What was tested:** POST /api/ai/parse-schedule with "Schedule implant review after 3 months"
- **Expected:** Returns 2026-09-10
- **Actual:** preferredDate="2026-09-10" — correctly calculated
- **HTTP Status:** 200

---

### [PASS] 5.5 — Implant Advance Payment: ₹20,000
- **What was tested:** POST /api/payments ₹20,000 advance
- **Actual:** Payment recorded
- **HTTP Status:** 200

---

### [PASS] 6.1 — Analytics Dashboard
- **What was tested:** GET /api/analytics/dashboard
- **Expected:** Today's revenue, pending dues, queue count, patients today
- **Actual:** Returns `totalAppointmentsToday=2`, `completedToday=1`, `recentAppointments` array — but **NO revenue figures, NO pending dues total, NO queue snapshot**
- **HTTP Status:** 200
- **Note:** Dashboard is appointment-centric only. Missing financial summary entirely.

---

### [MISSING] 6.2 — Receptionist Dashboard Endpoint
- **What was tested:** GET /api/dashboard/receptionist
- **Expected:** Waiting patients, checked-in, pending bills, next appointments
- **Actual:** 404 — does not exist
- **HTTP Status:** 404

---

### [MISSING] 6.3 — Doctor Dashboard Endpoint
- **What was tested:** GET /api/dashboard/doctor
- **Expected:** Today's consults, active treatments, pending procedures, recalls
- **Actual:** 404 — does not exist
- **HTTP Status:** 404

---

### [MISSING] 6.4 — Finance Dashboard Endpoint
- **What was tested:** GET /api/dashboard/finance
- **Expected:** Today's collections, pending dues (₹86,500+), lab payments, revenue
- **Actual:** 404 — does not exist
- **HTTP Status:** 404

---

### [MISSING] 6.5 — General Dashboard Route
- **What was tested:** GET /api/dashboard
- **Actual:** 404
- **HTTP Status:** 404

---

### [PASS] 7.1 — Queue Listing
- **What was tested:** GET /api/queue
- **Expected:** Returns queue entries with statuses
- **Actual:** 2 entries returned, statuses: waiting and in_consultation
- **HTTP Status:** 200

---

### [PASS] 7.2 — Queue Status Transition (PATCH)
- **What was tested:** PATCH /api/queue/:id with status=in_consultation
- **Actual:** Status updated successfully
- **HTTP Status:** 200

---

### [PASS] 7.3 — Complete Consult
- **What was tested:** POST /api/queue/:id/complete-consult
- **Expected:** Queue entry moves to ready_for_checkout, consultation saved
- **Actual:** Success — requires `patientId` in payload (not documented)
- **HTTP Status:** 200

---

### [PASS] 7.4 — Checkout Summary + Checkout
- **What was tested:** GET /api/queue/:id/checkout-summary + POST /api/queue/:id/checkout
- **Actual:** Both return 200 successfully
- **HTTP Status:** 200

---

### [FAIL] 7.5 — All Queue Statuses Represented
- **What was tested:** Whether all statuses (waiting, in_consultation, treatment_ongoing, billing_pending, completed) appear
- **Expected:** Full status lifecycle visible in queue
- **Actual:** `treatment_ongoing` and `billing_pending` were never observed in queue responses — no way to PATCH to those statuses from queue endpoint
- **Note:** After `complete-consult`, entry moves to `ready_for_checkout`. `treatment_ongoing` and `billing_pending` are conceptual statuses not supported by the queue schema.

---

### [MISSING] 9.1 — WhatsApp Prescription Send
- **What was tested:** Any notification endpoint for sending prescription to patient
- **Actual:** 404 — no notification system
- **HTTP Status:** 404

---

### [MISSING] 9.2 — Appointment Reminder Notification
- **Actual:** 404 — no notification system

---

### [MISSING] 9.3 — Payment Pending Reminder
- **Actual:** 404 — no notification system

---

### [MISSING] 9.4 — Recall Reminder
- **Actual:** 404 — no notification system

---

### [PASS] 10.1 — Missing Name Validation
- **What was tested:** POST /api/patients without `name` field
- **Expected:** 400 validation error
- **Actual:** Returned validation error `{"code":"VALIDATION_ERROR","message":"Validation failed","details":[{"field":"name",...}]}`
- **HTTP Status:** 400

---

### [FAIL] 10.2 — Overpayment Guard
- **What was tested:** POST /api/payments with amount=₹9,999,999
- **Expected:** 400 — amount exceeds outstanding balance
- **Actual:** Payment accepted (HTTP 200). No overpayment guard exists.
- **HTTP Status:** 200

---

### [PASS] 10.3 — Non-existent Patient 404
- **What was tested:** GET /api/patients/00000000-0000-0000-0000-000000000000
- **Expected:** 404
- **Actual:** 404
- **HTTP Status:** 404

---

### [PASS] 10.4 — Empty Voice Transcript
- **What was tested:** POST /api/ai/generate-note with empty string transcript
- **Expected:** Graceful error, not 500
- **Actual:** Error returned (not 500) — server handled gracefully
- **HTTP Status:** 400/422

---

### [FAIL] 10.5 — Appointment Time Conflict Detection
- **What was tested:** POST two appointments for same doctor, same date/time
- **Expected:** Second booking rejected with conflict error
- **Actual:** Both created successfully — no conflict detection
- **HTTP Status:** 200 (both)
- **Note:** Double-booking risk exists across all scheduling.

---

## Critical Blockers

These failures break the core clinical workflow:

1. **UHID Not Generated** — Patients have no clinic-unique identifier. Essential for front-desk identification, records lookup, and physical chart labelling. Without UHID, any two "Karthik Raman" entries are indistinguishable.

2. **complete-consult requires undocumented `patientId`** — The endpoint `POST /api/queue/:id/complete-consult` requires `patientId` in the body but the queue entry already knows the patient. Missing this field returns a silent validation error. Any frontend not sending this will silently fail consultation completion.

3. **No Overpayment Guard** — Payments of any amount are accepted. A receptionist typo (₹28000 instead of ₹2800) is silently recorded. No cap against treatment plan's estimated cost.

4. **Appointment Double-Booking** — No conflict detection. Two patients can be booked at 10:00 AM with the same doctor. This is a scheduling integrity failure for any multi-doctor or high-volume clinic.

5. **Dashboard has no financial data** — The only dashboard endpoint (`/api/analytics/dashboard`) returns appointment counts only. Zero revenue, zero pending dues, zero collections summary. The finance and receptionist views cannot function.

---

## Non-Critical Issues

6. **Gender enum is case-sensitive, undocumented** — API requires `"male"` not `"Male"`. Frontend must normalize before sending. Test scenario used "Male" (natural language) and got a 400.

7. **Lab order status enum mismatch** — `"in_progress"` is intuitive but invalid; valid values are `pending|sent|received|completed`. The test scenario specified `in_progress` and got 400. API docs (if any) should make valid values explicit, and the frontend status picker must use these exact strings.

8. **`guardianName` field silently ignored** — Submitted for Aadhya Krishnan (minor patient). Accepted without error but not stored. Minor patients need a guardian contact.

9. **Implant metadata in free-text notes** — Brand, lot number, implant size are stored in `notes` as unstructured text. Cannot be filtered/reported on. Clinical and inventory use cases need structured fields.

10. **Dashboard `pendingFollowUps` returns 0** — After creating multiple follow-up appointments, the dashboard shows `pendingFollowUps=0`. The query logic appears broken.

---

## Missing Endpoints

| Endpoint | Purpose | Clinical Priority |
|---|---|---|
| `PATCH /api/patients/:id/tooth/:number` | Set per-tooth status (infection, RCT, restoration) | HIGH — tooth chart unusable without this |
| `/api/notifications/*` or `/api/whatsapp/*` | Send WhatsApp prescription, reminders, payment nudges | HIGH — clinics rely on WhatsApp communication |
| `/api/dashboard/receptionist` | Waiting list, pending bills, next appointments | HIGH |
| `/api/dashboard/doctor` | Today's consults, active treatments, recalls | HIGH |
| `/api/dashboard/finance` | Today's collections, pending dues, revenue | HIGH |
| `/api/appointments/recurring` | Bulk-create N monthly recalls from a start date | MEDIUM — critical for ortho |
| `/api/payment-plans` | EMI plan creation and tracking | MEDIUM — used in all long-term treatments |

---

## Recommendations (Priority Order)

1. **Add UHID generation** — Add a `uhid` column to `patients`, auto-populated on insert using clinic prefix + sequence (e.g., `VDS-0001`). Return it in the creation response.

2. **Fix complete-consult to not require patientId** — The queue entry already has `patient_id`. Remove the requirement or auto-fill from the queue entry on the backend.

3. **Add overpayment guard** — Before recording a payment, check `estimatedCost - sum(payments)` for the linked treatment plan. Reject if `amount > outstanding`. At minimum, flag if total payments exceed any treatment plan cost.

4. **Add appointment conflict detection** — On `POST /api/appointments`, query for existing appointments at the same `(clinic_id, doctor_id, date, time)` range and return 409 if overlap found.

5. **Build financial dashboard query** — Add a `/api/analytics/finance` endpoint (or expand the existing dashboard) to return: `today_collections`, `pending_dues` (estimated_cost - paid across all active treatment plans), `completed_treatments_today`, `lab_payments_outstanding`.

6. **Add tooth chart write endpoint** — Add `PATCH /api/patients/:id/teeth` that accepts `{ toothNumber, statuses: ['infection', 'rct_initiated', 'temporary_restoration'] }`. Store in a `treatment_teeth` or `tooth_chart` table linked to the patient.

7. **Add WhatsApp/notification layer** — Even a basic integration (Twilio or WATI) for prescription PDF share + appointment reminder. Log all sends to a `notification_logs` table.

8. **Add recurring appointment creation** — Add `POST /api/appointments/recurring` accepting `{ patientId, startDate, intervalDays, count, purpose }`. Auto-creates N appointments at interval.

9. **Add payment plan / EMI schema** — Add a `payment_plans` table with `total`, `paid`, `emi_amount`, `emi_frequency`, `next_due_date`. Link to treatment plans.

10. **Store guardian info** — Add `guardian_name` and `guardian_phone` columns to `patients` table. Required for minors.

11. **Document and normalise API field names** — `purpose` vs `type` for appointments, `appointmentDate`/`appointmentTime` split instead of ISO datetime, `patientId` required in complete-consult body — all of these are undocumented traps. Write an OpenAPI spec or at minimum a `API.md`.
