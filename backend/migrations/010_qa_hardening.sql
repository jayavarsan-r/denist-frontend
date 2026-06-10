-- ============================================================================
-- Migration 010 — QA hardening: UHID, guardians, tooth_chart, payment_plans,
-- notification_logs, treatment_plans.metadata. Idempotent (safe to re-run).
-- Run in the Supabase SQL editor. Verify with REST after applying.
-- ============================================================================

-- ── patients: UHID + guardian ───────────────────────────────────────────────
alter table public.patients add column if not exists uhid           text;
alter table public.patients add column if not exists guardian_name  text;
alter table public.patients add column if not exists guardian_phone text;
create unique index if not exists patients_clinic_uhid_uniq
  on public.patients (clinic_id, uhid) where uhid is not null;

-- ── treatment_plans: structured metadata (implant brand/lot/size, stages) ────
alter table public.treatment_plans add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ── tooth_chart: current per-tooth status (one row per tooth) ────────────────
create table if not exists public.tooth_chart (
  id           uuid primary key default uuid_generate_v4(),
  clinic_id    uuid references public.clinics(id)  on delete cascade,
  patient_id   uuid references public.patients(id) on delete cascade,
  tooth_number text not null,
  conditions   jsonb not null default '[]'::jsonb,
  surfaces     jsonb,
  notes        text,
  updated_by   uuid references public.staff(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (clinic_id, patient_id, tooth_number)
);
create index if not exists tooth_chart_patient_idx on public.tooth_chart (clinic_id, patient_id);

-- ── payment_plans: EMI schedule ──────────────────────────────────────────────
create table if not exists public.payment_plans (
  id                 uuid primary key default uuid_generate_v4(),
  clinic_id          uuid references public.clinics(id)         on delete cascade,
  patient_id         uuid references public.patients(id)        on delete cascade,
  treatment_plan_id  uuid references public.treatment_plans(id) on delete set null,
  total_amount       numeric(10,2) not null default 0,
  advance_paid       numeric(10,2) not null default 0,
  emi_amount         numeric(10,2) not null default 0,
  emi_frequency      text not null default 'monthly',
  installments_total int  not null default 0,
  next_due_date      date,
  status             text not null default 'active',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
create index if not exists payment_plans_patient_idx on public.payment_plans (clinic_id, patient_id);
create index if not exists payment_plans_plan_idx    on public.payment_plans (treatment_plan_id);

-- ── notification_logs: audit + provider-swap target ──────────────────────────
create table if not exists public.notification_logs (
  id                  uuid primary key default uuid_generate_v4(),
  clinic_id           uuid references public.clinics(id)  on delete cascade,
  patient_id          uuid references public.patients(id) on delete set null,
  type                text not null,
  channel             text not null default 'whatsapp',
  recipient           text,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued',
  provider            text not null default 'stub',
  provider_message_id text,
  error               text,
  created_by          uuid references public.staff(id) on delete set null,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists notification_logs_clinic_idx  on public.notification_logs (clinic_id, created_at desc);
create index if not exists notification_logs_patient_idx on public.notification_logs (patient_id);
