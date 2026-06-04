-- ============================================================
-- DentAI — Supabase Migration Script
-- Run this entire file in the Supabase SQL Editor
-- Project: Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
-- Safe to re-run: all statements use IF NOT EXISTS / CREATE OR REPLACE
-- Recommended order: run all at once, top to bottom
-- ============================================================


-- ============================================================
-- MIGRATION 001 — Missing Columns
-- Fix: queue fails without clinical_flags; PDF follow_up always blank;
--      cleanup job doesn't run without audio_uploaded_at;
--      clinic scoping impossible without clinic_id on visits/appointments/prescriptions
-- ============================================================

-- clinical_flags on patients (queue SELECT fails without this column)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_flags JSONB DEFAULT '{}';

-- sitting_number on visits and appointments (treatment plan detail view)
ALTER TABLE visits       ADD COLUMN IF NOT EXISTS sitting_number INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sitting_number INTEGER;

-- audio_uploaded_at on visit_notes (cleanup job needs this to find old recordings)
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS audio_uploaded_at TIMESTAMPTZ;

-- follow_up on prescriptions (PDF always showed blank follow-up — now it saves)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up TEXT;

-- clinic_id on visits, appointments, prescriptions (multi-doctor scoping)
ALTER TABLE visits        ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- pending_amount is already a GENERATED ALWAYS AS column in this schema
-- (computed automatically by Postgres as estimated_cost - collected_amount)
-- Do NOT add or update it manually — the column already exists and self-maintains.


-- ============================================================
-- MIGRATION 002 — Performance Indexes
-- Safe to run while app is live (CREATE INDEX CONCURRENTLY not available
-- in Supabase SQL Editor, so these use standard CREATE INDEX IF NOT EXISTS)
-- ============================================================

-- Enable pg_trgm for fast ILIKE name/phone search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Patients
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id   ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_dentist_id  ON patients(dentist_id);
CREATE INDEX IF NOT EXISTS idx_patients_is_deleted  ON patients(is_deleted);
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm   ON patients USING gin(name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm  ON patients USING gin(phone gin_trgm_ops);

-- Visits
CREATE INDEX IF NOT EXISTS idx_visits_clinic_id     ON visits(clinic_id);
CREATE INDEX IF NOT EXISTS idx_visits_dentist_id    ON visits(dentist_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id    ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_visit_date    ON visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_follow_up     ON visits(follow_up_date) WHERE follow_up_done = false;

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appointments_dentist_id ON appointments(dentist_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date       ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id  ON appointments(clinic_id);

-- Queue
CREATE INDEX IF NOT EXISTS idx_queue_clinic_date ON queue_entries(clinic_id, queue_date);
CREATE INDEX IF NOT EXISTS idx_queue_status      ON queue_entries(status);

-- Treatment Plans
CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patient_id, status);

-- Prescriptions
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);

-- Voice recordings (dataset queries)
CREATE INDEX IF NOT EXISTS idx_voice_recordings_dentist ON voice_recordings(dentist_id);


-- ============================================================
-- MIGRATION 003 — Soft Delete Columns
-- Replaces is_deleted BOOLEAN with deleted_at TIMESTAMPTZ + deleted_by UUID
-- is_deleted column is KEPT for now — will be dropped in migration 006
-- after all query code is confirmed to use deleted_at
-- ============================================================

ALTER TABLE patients       ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE visits         ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE appointments   ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
                             ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES staff(id);

ALTER TABLE prescriptions  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE xrays          ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE payments       ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE queue_entries  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

ALTER TABLE staff          ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES staff(id);

-- Migrate existing soft-deleted patients to new column
UPDATE patients SET deleted_at = NOW() WHERE is_deleted = true AND deleted_at IS NULL;

-- Partial indexes for fast active-record queries (WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at     ON patients(deleted_at)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visits_deleted_at       ON visits(deleted_at)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at ON appointments(deleted_at)  WHERE deleted_at IS NULL;


-- ============================================================
-- MIGRATION 004 — Audit Log Table
-- Tracks all create/update/delete/payment events per clinic
-- Audit log failures must NEVER block business operations
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id    UUID        REFERENCES clinics(id),
  staff_id     UUID        REFERENCES staff(id),
  entity_type  TEXT        NOT NULL,  -- 'patient', 'prescription', 'payment', etc.
  entity_id    UUID        NOT NULL,
  action       TEXT        NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'PAYMENT', 'ROLE_CHANGE'
  old_value    JSONB,
  new_value    JSONB,
  request_id   TEXT,                  -- correlates to x-request-id response header
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic  ON audit_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff   ON audit_logs(staff_id, created_at DESC);


-- ============================================================
-- MIGRATION 005 — Payment Helper RPC
-- pending_amount is a GENERATED column — no UPDATE needed.
-- This RPC returns the current balance for a treatment plan after a payment.
-- Called optionally by the backend to read back the post-payment state.
-- ============================================================

CREATE OR REPLACE FUNCTION get_plan_balance(plan_id UUID)
RETURNS TABLE(id UUID, estimated_cost NUMERIC, collected_amount NUMERIC, pending_amount NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT tp.id, tp.estimated_cost, tp.collected_amount, tp.pending_amount
  FROM treatment_plans tp
  WHERE tp.id = plan_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VERIFY — Run these SELECTs to confirm migrations applied
-- ============================================================

-- Check clinical_flags exists on patients
SELECT column_name FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'clinical_flags';

-- Check follow_up exists on prescriptions
SELECT column_name FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'follow_up';

-- Check clinic_id exists on visits
SELECT column_name FROM information_schema.columns
WHERE table_name = 'visits' AND column_name = 'clinic_id';

-- Check audit_logs table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'audit_logs';

-- Check get_plan_balance function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_plan_balance';

-- ============================================================
-- END OF MIGRATIONS
-- ============================================================
