-- ════════════════════════════════════════════════════════════════════════════
-- 001 — MISSING COLUMNS  (idempotent, safe to re-run)
-- ════════════════════════════════════════════════════════════════════════════
-- Reconciles older live deployments with the columns the app already reads/writes.
-- All guarded with IF NOT EXISTS so this is a no-op where the column already exists.

-- prescriptions.follow_up — dictated follow-up text; currently lost, blank in PDF (HIGH-003)
alter table public.prescriptions add column if not exists follow_up text;

-- clinic_id scoping columns (needed for clinic-wide authorization, not dentist_id)
alter table public.prescriptions add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
alter table public.visits        add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
alter table public.appointments  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;

-- sitting_number used by treatment-plan detail joins
alter table public.visits       add column if not exists sitting_number int;
alter table public.appointments add column if not exists sitting_number int;

-- clinical_flags is a comma-delimited TEXT list built by the frontend
-- (e.g. "bg:B+,diabetes,hypertension"). Keep TEXT — do NOT convert to JSONB,
-- the frontend patient.service serialises/deserialises it as a string.
alter table public.patients add column if not exists clinical_flags text;

-- Appointment status has no CHECK constraint, so the new 'suggested' status
-- (created by complete-consult, confirmed by reception at checkout) needs no DDL.
-- Documented here for traceability only.
