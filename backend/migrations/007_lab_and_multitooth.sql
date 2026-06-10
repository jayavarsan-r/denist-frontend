-- ============================================================================
-- Migration 007 — Lab orders + multi-tooth treatment support
-- ============================================================================
-- Run this in the Supabase SQL editor. Idempotent (safe to re-run).
--
-- Adds:
--   1. lab_orders         — real lab work tracking (replaces frontend mock)
--   2. treatment_teeth    — links one treatment_plan/visit to MANY teeth, so a
--                           single procedure can cover several teeth (e.g. RCT on
--                           36 and 37). Existing single tooth_number columns stay
--                           for back-compat / "primary tooth".
-- ============================================================================

-- ── 1. lab_orders ───────────────────────────────────────────────────────────
create table if not exists public.lab_orders (
  id                   uuid primary key default uuid_generate_v4(),
  clinic_id            uuid references public.clinics(id)         on delete cascade,
  patient_id           uuid references public.patients(id)        on delete cascade,
  dentist_id           uuid references public.dentists(id)        on delete set null,
  treatment_plan_id    uuid references public.treatment_plans(id) on delete set null,
  procedure_type       text,                       -- Crown, Bridge, Denture, ...
  tooth_number         text,                       -- primary tooth (FDI)
  lab_name             text,
  work_description     text,
  shade                text,                       -- e.g. A2
  impression_type      text,                       -- Digital scan / PVS impression
  sent_date            date,
  expected_return_date date,
  actual_return_date   date,
  status               text not null default 'pending',  -- pending|sent|received|completed
  cost_to_clinic       numeric(10,2) not null default 0,
  charged_to_patient   numeric(10,2) not null default 0,
  report_url           text,                       -- uploaded lab report / scan
  notes                text,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

create index if not exists lab_orders_clinic_status_idx on public.lab_orders (clinic_id, status);
create index if not exists lab_orders_patient_idx       on public.lab_orders (patient_id);
create index if not exists lab_orders_plan_idx          on public.lab_orders (treatment_plan_id);

-- ── 2. treatment_teeth (multi-tooth link) ───────────────────────────────────
-- A row links a tooth to the treatment_plan it belongs to and (optionally) the
-- specific visit/sitting it was worked on. Query by tooth_number for history;
-- query by visit_id/treatment_plan_id to get "all teeth in this procedure".
create table if not exists public.treatment_teeth (
  id                uuid primary key default uuid_generate_v4(),
  clinic_id         uuid references public.clinics(id)          on delete cascade,
  patient_id        uuid references public.patients(id)         on delete cascade,
  treatment_plan_id uuid references public.treatment_plans(id)  on delete cascade,
  visit_id          uuid references public.visits(id)           on delete cascade,
  tooth_number      text not null,                -- FDI, e.g. '36'
  created_at        timestamptz not null default now()
);

create index if not exists treatment_teeth_tooth_idx   on public.treatment_teeth (clinic_id, patient_id, tooth_number);
create index if not exists treatment_teeth_plan_idx    on public.treatment_teeth (treatment_plan_id);
create index if not exists treatment_teeth_visit_idx   on public.treatment_teeth (visit_id);
create index if not exists treatment_teeth_patient_idx on public.treatment_teeth (patient_id);
