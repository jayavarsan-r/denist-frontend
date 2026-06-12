-- 014_consultation_drafts.sql
-- Phase 2: async voice pipeline. consultation_drafts is the AI pipeline artifact —
-- the worker writes the extraction here, the doctor's Verification Card reads it,
-- and the confirm step records what the doctor actually accepted (the corrections
-- column is the learning loop's raw material).
--
-- Schema adaptations vs the original spec (matched to THIS database):
--   • visit_id is NULLABLE — in this codebase the visit row is created at confirm
--     time (complete-consult), not before recording starts. The confirm step links it.
--   • queue_entry_id is NULLABLE — the patient-profile consult records without a
--     queue entry; drafts are keyed on (clinic_id, patient_id).
--   • doctor_id references staff(id) and is nullable (queue entries may have no
--     assigned_doctor; we fall back to the recording staff member).
--
-- Apply via Supabase SQL editor. Requires migration 004+ (staff/clinics present).

CREATE TABLE IF NOT EXISTS public.consultation_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES public.clinics(id),
  patient_id          uuid NOT NULL REFERENCES public.patients(id),
  queue_entry_id      uuid REFERENCES public.queue_entries(id),
  visit_id            uuid REFERENCES public.visits(id),
  doctor_id           uuid REFERENCES public.staff(id),

  -- raw pipeline data (kept for audit + future fine-tuning)
  audio_storage_path  text,
  raw_transcript      text,
  gemini_raw          jsonb,

  -- structured intent object (Gemini output after Zod validation)
  extracted           jsonb NOT NULL DEFAULT '{}',
  -- fields that failed Zod validation → shown amber on the Verification Card
  low_confidence      jsonb NOT NULL DEFAULT '[]',

  -- deterministic safety-net output: [{type, severity, field, message}]
  safety_flags        jsonb NOT NULL DEFAULT '[]',

  -- processing | pending_review | confirmed | rejected | error
  status              text NOT NULL DEFAULT 'processing',

  -- what the doctor actually confirmed (may differ from extracted)
  confirmed_data      jsonb,
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES public.staff(id),

  -- diff between extracted and confirmed: { field: { ai_said, doctor_said } }
  corrections         jsonb,

  -- pipeline failure details
  error_code          text,
  error_detail        text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drafts_clinic   ON public.consultation_drafts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_drafts_patient  ON public.consultation_drafts(patient_id);
CREATE INDEX IF NOT EXISTS idx_drafts_queue    ON public.consultation_drafts(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_drafts_visit    ON public.consultation_drafts(visit_id);
-- few-shot lookup: last N confirmed-with-corrections per doctor
CREATE INDEX IF NOT EXISTS idx_drafts_fewshot  ON public.consultation_drafts(doctor_id, confirmed_at DESC)
  WHERE status = 'confirmed' AND corrections IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_pending  ON public.consultation_drafts(status)
  WHERE status IN ('processing', 'pending_review');

-- Realtime: the Verification Card subscribes to its draft row directly.
-- (No-op if the table is already in the publication.)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_drafts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The queue board piggybacks on queue_entries realtime: draft_id + the
-- recording_processing / draft_ready / voice_error status values (status is a
-- plain text column — no CHECK constraint exists on this table).
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES public.consultation_drafts(id);

-- ── Procedure catalog (context injection needs it; Phase 3 inventory references it) ──
CREATE TABLE IF NOT EXISTS public.procedures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES public.clinics(id),
  name             text NOT NULL,
  code             text,
  default_sittings int DEFAULT 1,
  default_fee      numeric(10,2),
  active           boolean DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);
CREATE INDEX IF NOT EXISTS idx_procedures_clinic ON public.procedures(clinic_id) WHERE active;

-- Seed common dental procedures for every existing clinic (idempotent).
INSERT INTO public.procedures (clinic_id, name, code, default_sittings, default_fee)
SELECT c.id, proc.name, proc.code, proc.sittings, proc.fee
FROM public.clinics c
CROSS JOIN (VALUES
  ('Root Canal Treatment',     'RCT',           3, 3500.00),
  ('Crown - PFM',              'CROWN_PFM',     2, 5000.00),
  ('Crown - Zirconia',         'CROWN_ZIR',     2, 8000.00),
  ('Scaling and Polishing',    'SCALING',       1, 800.00),
  ('Extraction - Simple',      'EXT_SIMPLE',    1, 500.00),
  ('Extraction - Surgical',    'EXT_SURG',      1, 1500.00),
  ('Composite Filling',        'COMP_FILL',     1, 800.00),
  ('GIC Filling',              'GIC_FILL',      1, 500.00),
  ('Orthodontic Consultation', 'ORTHO_CONSULT', 1, 500.00),
  ('Implant Placement',        'IMPLANT',       2, 25000.00),
  ('Denture - Full',           'DENTURE_FULL',  3, 8000.00),
  ('Denture - Partial',        'DENTURE_PARTIAL', 2, 5000.00),
  ('Teeth Whitening',          'WHITENING',     1, 3000.00),
  ('Bridge',                   'BRIDGE',        3, 12000.00),
  ('Inlay / Onlay',            'INLAY',         2, 4000.00)
) AS proc(name, code, sittings, fee)
ON CONFLICT (clinic_id, name) DO NOTHING;
