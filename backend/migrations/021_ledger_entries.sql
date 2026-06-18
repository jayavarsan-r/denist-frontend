-- 021_ledger_entries.sql
-- Persistent manual income/expense ledger for the finance section (#11).
-- Complements `payments` (patient collections) — this table holds ONLY manually
-- entered income/expense (rent, salary, supplies, lab costs, misc income).
-- Idempotent; additive (new empty table, touches no existing data).

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  type        text NOT NULL CHECK (type IN ('income','expense')),
  category    text NOT NULL,
  description text,
  amount      numeric NOT NULL CHECK (amount >= 0),
  entry_date  date NOT NULL DEFAULT CURRENT_DATE,
  patient_id  uuid,
  lab_case_id uuid,
  created_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_clinic_date
  ON public.ledger_entries (clinic_id, entry_date DESC)
  WHERE deleted_at IS NULL;
