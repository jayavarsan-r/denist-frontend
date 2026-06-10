-- ════════════════════════════════════════════════════════════════════════════
-- 002 — PERFORMANCE INDEXES  (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
-- Covers the hot query paths: clinic-scoped lists, patient timelines, date filters.
-- Run after 001 (some reference clinic_id added there).

create index if not exists idx_patients_clinic_id        on public.patients (clinic_id);
create index if not exists idx_patients_dentist_id       on public.patients (dentist_id);

create index if not exists idx_visits_clinic_id          on public.visits (clinic_id);
create index if not exists idx_visits_dentist_id         on public.visits (dentist_id);
create index if not exists idx_visits_patient_id         on public.visits (patient_id);
create index if not exists idx_visits_visit_date         on public.visits (visit_date);

create index if not exists idx_appointments_clinic_id    on public.appointments (clinic_id);
create index if not exists idx_appointments_dentist_id   on public.appointments (dentist_id);
create index if not exists idx_appointments_date         on public.appointments (appointment_date);

create index if not exists idx_queue_entries_clinic_date on public.queue_entries (clinic_id, queue_date);
create index if not exists idx_queue_entries_status      on public.queue_entries (clinic_id, queue_date, status);

create index if not exists idx_prescriptions_clinic_id   on public.prescriptions (clinic_id);
create index if not exists idx_prescriptions_patient     on public.prescriptions (patient_id, created_at desc);

create index if not exists idx_payments_clinic           on public.payments (clinic_id, payment_date desc);
create index if not exists idx_treatment_plans_clinic    on public.treatment_plans (clinic_id, status);
