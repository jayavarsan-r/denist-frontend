-- ════════════════════════════════════════════════════════════════════════════
-- 004 — SOFT DELETE (deleted_at / deleted_by)  (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
-- Introduces the canonical soft-delete columns. The existing patients.is_deleted
-- boolean is KEPT for now and backfilled below — the query code is migrated from
-- `.eq('is_deleted', false)` to `.is('deleted_at', null)` incrementally during the
-- repository pass (Phase 5). Only after ALL read paths are migrated should a later
-- migration drop is_deleted. Do not drop it in this migration.

alter table public.patients        add column if not exists deleted_at timestamptz;
alter table public.patients        add column if not exists deleted_by uuid references public.staff(id) on delete set null;
alter table public.visits          add column if not exists deleted_at timestamptz;
alter table public.visits          add column if not exists deleted_by uuid references public.staff(id) on delete set null;
alter table public.appointments    add column if not exists deleted_at timestamptz;
alter table public.appointments    add column if not exists deleted_by uuid references public.staff(id) on delete set null;
alter table public.treatment_plans add column if not exists deleted_at timestamptz;
alter table public.treatment_plans add column if not exists deleted_by uuid references public.staff(id) on delete set null;
alter table public.prescriptions   add column if not exists deleted_at timestamptz;
alter table public.prescriptions   add column if not exists deleted_by uuid references public.staff(id) on delete set null;
alter table public.xrays           add column if not exists deleted_at timestamptz;
alter table public.xrays           add column if not exists deleted_by uuid references public.staff(id) on delete set null;

-- Backfill: existing soft-deleted patients get a deleted_at timestamp so the new
-- deleted_at-based queries hide them exactly as the old is_deleted queries did.
update public.patients
set deleted_at = coalesce(updated_at, created_at, now())
where is_deleted = true and deleted_at is null;

-- Partial indexes so "not deleted" lookups stay fast.
create index if not exists idx_patients_active     on public.patients (clinic_id)        where deleted_at is null;
create index if not exists idx_visits_active       on public.visits (clinic_id)          where deleted_at is null;
create index if not exists idx_appointments_active on public.appointments (clinic_id)    where deleted_at is null;
