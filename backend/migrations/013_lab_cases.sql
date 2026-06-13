-- 013_lab_cases.sql
-- Phase 4: WhatsApp engine + Lab Case Tracker. The NEW lab_cases system —
-- completely separate from the old lab_orders table/routes, which stay untouched.
--
-- Core principle: WhatsApp is the transport, THIS database is the truth. Every
-- status lives here; messages are events that try to move it. The tracker works
-- fully manually even if every parser fails.
--
-- BEFORE APPLYING, check for pre-existing tables:
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--   AND table_name IN ('labs','lab_cases','lab_case_files','lab_messages',
--                      'lab_case_events','whatsapp_sessions','reception_inbox_items');
--
-- ALSO REQUIRED (dashboard, not SQL): Supabase → Storage → New bucket →
--   'lab-docs' (private) — migrations cannot create Storage buckets.

-- ── New columns the WhatsApp engine needs ─────────────────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS whatsapp_number text,   -- the clinic's WABA number (E.164)
  ADD COLUMN IF NOT EXISTS owner_phone     text;   -- EOD summary recipient

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in  boolean NOT NULL DEFAULT false;

-- ── Case-code sequence (per instance; codes carry a clinic prefix) ────────────
CREATE SEQUENCE IF NOT EXISTS lab_case_code_seq START 1;
CREATE OR REPLACE FUNCTION public.nextval_lab_case_code_seq()
RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('lab_case_code_seq'); $$;

-- ── Labs this clinic works with ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               uuid NOT NULL REFERENCES public.clinics(id),
  name                    text NOT NULL,
  phone_numbers           text[] NOT NULL DEFAULT '{}',  -- owner/technician/pickup — SIMs change
  preferred_language      text NOT NULL DEFAULT 'en',    -- 'en' | 'ta'
  consent_logged_at       timestamptz,
  automation_paused       boolean NOT NULL DEFAULT false,
  default_turnaround_days int NOT NULL DEFAULT 5,
  notes                   text,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (clinic_id, name)
);
CREATE INDEX IF NOT EXISTS idx_labs_clinic ON public.labs(clinic_id);

-- ── The lab case ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES public.clinics(id),
  lab_id            uuid REFERENCES public.labs(id),    -- nullable: a DRAFT may have no lab yet
  patient_id        uuid NOT NULL REFERENCES public.patients(id),
  visit_id          uuid REFERENCES public.visits(id),
  treatment_plan_id uuid REFERENCES public.treatment_plans(id),

  case_code         text NOT NULL,  -- '{PREFIX}-{SEQ}' e.g. 'SR-0042' — the WhatsApp threading key
  case_type         text NOT NULL,
  -- crown_pfm | crown_zirconia | bridge | denture_full | denture_partial | aligner | inlay_onlay | other
  tooth_fdi         int[] NOT NULL DEFAULT '{}',
  shade             text,
  instructions      text,
  expected_date     date,

  status            text NOT NULL DEFAULT 'DRAFT',
  -- DRAFT → SENT → ACKNOWLEDGED → IN_PROGRESS → READY → DISPATCHED → RECEIVED → FITTED
  -- ISSUE_RAISED from SENT/ACKNOWLEDGED/IN_PROGRESS/READY; CANCELLED pre-RECEIVED
  status_updated_at timestamptz DEFAULT now(),
  status_updated_by text,
  -- 'lab_button' | 'case_code_text' | 'llm_parse' | 'reception_manual' | 'timeout_job'

  created_by        uuid REFERENCES public.staff(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (clinic_id, case_code)
);
CREATE INDEX IF NOT EXISTS idx_lab_cases_clinic  ON public.lab_cases(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_cases_patient ON public.lab_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_cases_lab     ON public.lab_cases(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_cases_open    ON public.lab_cases(clinic_id, status)
  WHERE status NOT IN ('FITTED', 'CANCELLED');

-- ── Files on a case (impressions, shade, results, delivery slips) ────────────
CREATE TABLE IF NOT EXISTS public.lab_case_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_case_id   uuid NOT NULL REFERENCES public.lab_cases(id),
  clinic_id     uuid NOT NULL,
  storage_path  text NOT NULL,
  kind          text NOT NULL,  -- impression_photo | shade_photo | result_photo | delivery_slip | other
  source        text NOT NULL,  -- clinic_upload | lab_whatsapp
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_case_files_case ON public.lab_case_files(lab_case_id);

-- ── Every WhatsApp message in/out, linked to cases when resolvable ───────────
CREATE TABLE IF NOT EXISTS public.lab_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL,
  lab_id           uuid REFERENCES public.labs(id),
  lab_case_id      uuid REFERENCES public.lab_cases(id),  -- NULL until resolved
  direction        text NOT NULL,                          -- outbound | inbound
  wa_message_id    text UNIQUE,                            -- BSP id — the idempotency key
  body             text,
  media_paths      text[] DEFAULT '{}',
  parse_tier       text,        -- button | case_code | llm | manual | NULL(outbound)
  parse_confidence numeric(4,3),
  resolved         boolean NOT NULL DEFAULT false,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_messages_case   ON public.lab_messages(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_messages_clinic ON public.lab_messages(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_messages_unresolved
  ON public.lab_messages(clinic_id) WHERE resolved = false AND direction = 'inbound';

-- ── Immutable transition audit trail ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_case_events (
  id                bigserial PRIMARY KEY,
  lab_case_id       uuid NOT NULL REFERENCES public.lab_cases(id),
  from_status       text,
  to_status         text NOT NULL,
  trigger           text NOT NULL,
  source_message_id uuid REFERENCES public.lab_messages(id),
  notes             text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_case_events_case ON public.lab_case_events(lab_case_id);

-- ── 24h WhatsApp session windows (an inbound message opens a free window) ────
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  phone       text NOT NULL,   -- normalised E.164
  direction   text NOT NULL DEFAULT 'inbound',
  opened_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  UNIQUE (clinic_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_expiry ON public.whatsapp_sessions(clinic_id, phone, expires_at);

-- ── Reception inbox (tier-4 floor: unparseable messages + alerts land here) ──
CREATE TABLE IF NOT EXISTS public.reception_inbox_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id),
  type        text NOT NULL,
  -- unresolved_lab_message | patient_message | unknown_sender | lab_due_tomorrow
  -- | lab_overdue | lab_issue_stale
  payload     jsonb NOT NULL DEFAULT '{}',
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES public.staff(id),
  resolved_at timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reception_inbox
  ON public.reception_inbox_items(clinic_id, created_at DESC) WHERE resolved = false;

-- Realtime: the lab board + reception inbox update live.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_cases;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reception_inbox_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
