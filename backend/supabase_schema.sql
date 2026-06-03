-- DentAI — full schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── otp_codes ─────────────────────────────────────────────────────────────────
create table if not exists public.otp_codes (
  id          uuid primary key default uuid_generate_v4(),
  phone       text not null,
  code        text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on public.otp_codes (phone);

-- ─── dentists ──────────────────────────────────────────────────────────────────
create table if not exists public.dentists (
  id           uuid primary key default uuid_generate_v4(),
  phone        text unique,
  name         text,
  clinic_name  text,
  updated_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── clinics ───────────────────────────────────────────────────────────────────
create table if not exists public.clinics (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  city            text,
  join_code       text unique,
  display_id      text,
  owner_staff_id  uuid,
  created_at      timestamptz not null default now()
);

-- ─── staff ─────────────────────────────────────────────────────────────────────
create table if not exists public.staff (
  id          uuid primary key default uuid_generate_v4(),
  clinic_id   uuid references public.clinics(id) on delete cascade,
  dentist_id  uuid references public.dentists(id) on delete set null,
  phone       text,
  name        text,
  role        text not null default 'doctor', -- 'doctor' | 'receptionist'
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  unique(clinic_id, dentist_id)
);

-- back-fill owner_staff_id FK now that staff table exists
do $$ begin
  alter table public.clinics
    add constraint clinics_owner_staff_id_fkey
    foreign key (owner_staff_id) references public.staff(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ─── patients ──────────────────────────────────────────────────────────────────
create table if not exists public.patients (
  id                  uuid primary key default uuid_generate_v4(),
  dentist_id          uuid references public.dentists(id) on delete cascade,
  clinic_id           uuid references public.clinics(id) on delete set null,
  name                text not null,
  phone               text,
  age                 int,
  gender              text,
  medical_conditions  text,
  allergies           text,
  clinical_flags      text,
  is_deleted          boolean not null default false,
  updated_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists patients_dentist_idx on public.patients (dentist_id);
create index if not exists patients_clinic_idx  on public.patients (clinic_id);

-- ─── appointments ──────────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id                uuid primary key default uuid_generate_v4(),
  patient_id        uuid references public.patients(id) on delete cascade,
  dentist_id        uuid references public.dentists(id) on delete cascade,
  clinic_id         uuid references public.clinics(id) on delete set null,
  appointment_date  date,
  appointment_time  text,
  purpose           text,
  tooth_number      text,
  sitting_number    int,
  status            text not null default 'scheduled',
  updated_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists appointments_dentist_date_idx on public.appointments (dentist_id, appointment_date);

-- ─── visits ────────────────────────────────────────────────────────────────────
create table if not exists public.visits (
  id              uuid primary key default uuid_generate_v4(),
  patient_id      uuid references public.patients(id) on delete cascade,
  dentist_id      uuid references public.dentists(id) on delete cascade,
  clinic_id       uuid references public.clinics(id) on delete set null,
  visit_date      date not null default current_date,
  procedure_name  text,
  tooth_number    text,
  status          text not null default 'completed',
  raw_transcript  text,
  notes           text,
  medications     text,
  next_steps      text,
  follow_up_date  date,
  follow_up_done  boolean not null default false,
  sitting_number  int,
  cost            numeric(10,2),
  currency        text not null default 'INR',
  updated_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists visits_patient_idx  on public.visits (patient_id);
create index if not exists visits_dentist_idx  on public.visits (dentist_id);

-- ─── visit_notes ───────────────────────────────────────────────────────────────
create table if not exists public.visit_notes (
  id                   uuid primary key default uuid_generate_v4(),
  visit_id             uuid references public.visits(id) on delete cascade,
  patient_id           uuid references public.patients(id) on delete cascade,
  dentist_id           uuid references public.dentists(id) on delete cascade,
  note_number          int not null default 1,
  raw_transcript       text,
  structured_note      jsonb,
  procedure_name       text,
  tooth_number         text,
  status               text not null default 'completed',
  notes                text,
  medications          text,
  next_steps           text,
  follow_up_date       date,
  cost                 numeric(10,2),
  audio_storage_path   text,
  audio_file_size_kb   numeric(10,2),
  audio_duration_sec   numeric(10,2),
  audio_uploaded_at    timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists visit_notes_visit_idx on public.visit_notes (visit_id);

-- ─── treatment_plans ───────────────────────────────────────────────────────────
create table if not exists public.treatment_plans (
  id                  uuid primary key default uuid_generate_v4(),
  patient_id          uuid references public.patients(id) on delete cascade,
  dentist_id          uuid references public.dentists(id) on delete cascade,
  clinic_id           uuid references public.clinics(id) on delete set null,
  diagnosis           text,
  procedure_name      text not null,
  total_sittings      int not null default 1,
  completed_sittings  int not null default 0,
  estimated_cost      numeric(10,2) not null default 0,
  collected_amount    numeric(10,2) not null default 0,
  pending_amount      numeric(10,2) generated always as (
                        greatest(0, estimated_cost - collected_amount)
                      ) stored,
  status              text not null default 'active',
  notes               text,
  start_date          date,
  expected_end_date   date,
  updated_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists treatment_plans_patient_idx on public.treatment_plans (patient_id);

-- ─── queue_entries ─────────────────────────────────────────────────────────────
create table if not exists public.queue_entries (
  id                    uuid primary key default uuid_generate_v4(),
  clinic_id             uuid references public.clinics(id) on delete cascade,
  patient_id            uuid references public.patients(id) on delete cascade,
  treatment_plan_id     uuid references public.treatment_plans(id) on delete set null,
  added_by              uuid references public.staff(id) on delete set null,
  assigned_doctor       uuid references public.staff(id) on delete set null,
  chief_complaint       text,
  visit_reason          text,
  priority              text not null default 'normal',
  queue_date            date not null default current_date,
  token_number          int,
  sort_order            int,
  status                text not null default 'waiting',
  consultation_outcome  text,
  outcome_metadata      jsonb,
  notes                 text,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);
create index if not exists queue_entries_clinic_date_idx on public.queue_entries (clinic_id, queue_date);

-- ─── payments ──────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id                 uuid primary key default uuid_generate_v4(),
  clinic_id          uuid references public.clinics(id) on delete cascade,
  patient_id         uuid references public.patients(id) on delete cascade,
  treatment_plan_id  uuid references public.treatment_plans(id) on delete set null,
  queue_entry_id     uuid references public.queue_entries(id) on delete set null,
  received_by        uuid references public.staff(id) on delete set null,
  amount             numeric(10,2) not null,
  payment_method     text not null default 'cash',
  notes              text,
  payment_date       date not null default current_date,
  created_at         timestamptz not null default now()
);
create index if not exists payments_patient_idx on public.payments (patient_id);
create index if not exists payments_plan_idx    on public.payments (treatment_plan_id);

-- ─── prescriptions ─────────────────────────────────────────────────────────────
create table if not exists public.prescriptions (
  id              uuid primary key default uuid_generate_v4(),
  patient_id      uuid references public.patients(id) on delete cascade,
  dentist_id      uuid references public.dentists(id) on delete cascade,
  clinic_id       uuid references public.clinics(id) on delete set null,
  visit_id        uuid references public.visits(id) on delete set null,
  visit_note_id   uuid references public.visit_notes(id) on delete set null,
  queue_entry_id  uuid references public.queue_entries(id) on delete set null,
  raw_voice       text,
  medicines       jsonb not null default '[]',
  instructions    text,
  follow_up       text,
  created_at      timestamptz not null default now()
);
create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id);

-- ─── xrays ─────────────────────────────────────────────────────────────────────
create table if not exists public.xrays (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid references public.patients(id) on delete cascade,
  dentist_id    uuid references public.dentists(id) on delete cascade,
  clinic_id     uuid references public.clinics(id) on delete set null,
  visit_id      uuid references public.visits(id) on delete set null,
  xray_type     text not null default 'OPG',
  storage_path  text,
  file_size_kb  numeric(10,2),
  date_taken    date not null default current_date,
  tooth_number  text,
  notes         text,
  remarks       text,
  created_at    timestamptz not null default now()
);
create index if not exists xrays_patient_idx on public.xrays (patient_id);
