-- 016_clinic_id_fixes.sql
-- Phase 1 clinic_id audit fixes. clinic_id is the multi-tenancy boundary: every
-- clinical row must carry it. This migration (a) adds the column to the two tables
-- that never had it, and (b) backfills NULL clinic_id strays everywhere so the
-- application's strict clinic_id scoping (no more dentist_id OR-clauses) cannot
-- hide legacy rows.
--
-- MUST be applied together with (or before) deploying the strict-scoping backend:
-- until it runs, rows with clinic_id NULL are invisible to clinic members.
--
-- Numbering note: 012-015 are reserved by the v2 plan (inventory, lab cases,
-- consultation drafts, procedures) and land in later phases.

-- ── 1. visit_notes.clinic_id ──────────────────────────────────────────────────
alter table public.visit_notes
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists visit_notes_clinic_idx on public.visit_notes (clinic_id);

-- Backfill from the parent visit (authoritative source of the note's tenancy).
update public.visit_notes vn
   set clinic_id = v.clinic_id
  from public.visits v
 where vn.visit_id = v.id
   and vn.clinic_id is null
   and v.clinic_id is not null;

-- ── 2. voice_recordings.clinic_id ─────────────────────────────────────────────
alter table public.voice_recordings
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists voice_recordings_clinic_idx on public.voice_recordings (clinic_id);

-- ── 3. Backfill stray NULL clinic_id rows on clinic-stamped tables ────────────
-- Maps dentist_id → clinic via the staff table, but ONLY for dentists that belong
-- to exactly one clinic (ambiguous multi-clinic dentists are left for manual
-- review rather than guessed — list them with the query at the bottom).
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'patients', 'visits', 'appointments', 'treatment_plans',
      'prescriptions', 'xrays', 'lab_orders', 'voice_recordings'
    ])
  loop
    execute format($f$
      update public.%I tgt
         set clinic_id = sc.clinic_id
        from (
          select dentist_id, min(clinic_id::text)::uuid as clinic_id
            from public.staff
           where status = 'active' and dentist_id is not null
           group by dentist_id
          having count(distinct clinic_id) = 1
        ) sc
       where tgt.dentist_id = sc.dentist_id
         and tgt.clinic_id is null
    $f$, t);
  end loop;
end $$;

-- visit_notes strays whose parent visit was itself unstamped: same single-clinic
-- dentist mapping, keyed on the note's author.
update public.visit_notes vn
   set clinic_id = sc.clinic_id
  from (
    select dentist_id, min(clinic_id::text)::uuid as clinic_id
      from public.staff
     where status = 'active' and dentist_id is not null
     group by dentist_id
    having count(distinct clinic_id) = 1
  ) sc
 where vn.dentist_id = sc.dentist_id
   and vn.clinic_id is null;

-- ── 4. Manual-review report: rows this migration could NOT backfill ───────────
-- (multi-clinic dentists or rows with no dentist_id). Run after applying:
--
--   select 'patients' as tbl, count(*) from public.patients where clinic_id is null
--   union all select 'visits', count(*) from public.visits where clinic_id is null
--   union all select 'appointments', count(*) from public.appointments where clinic_id is null
--   union all select 'treatment_plans', count(*) from public.treatment_plans where clinic_id is null
--   union all select 'prescriptions', count(*) from public.prescriptions where clinic_id is null
--   union all select 'xrays', count(*) from public.xrays where clinic_id is null
--   union all select 'lab_orders', count(*) from public.lab_orders where clinic_id is null
--   union all select 'visit_notes', count(*) from public.visit_notes where clinic_id is null
--   union all select 'voice_recordings', count(*) from public.voice_recordings where clinic_id is null;
