-- 022_drop_duplicate_indexes.sql
-- Remove redundant / unused indexes found in the 2026-06-18 performance audit.
-- Each DROP was verified against pg_stat_user_indexes (idx_scan) AND pg_indexes
-- (exact indexdef) on the live DB before inclusion — we keep the more-used copy of
-- each identical pair and drop provably-unused (idx_scan = 0) extras. Duplicate
-- indexes add write overhead and bloat with zero read benefit (the planner already
-- splits usage onto the survivor). Idempotent (IF EXISTS); safe to re-run.

-- ── Exact duplicates: identical column list, keep the higher-scan copy ──────────

-- patients(clinic_id): keep idx_patients_clinic_id (189 scans), drop the dup (25)
DROP INDEX IF EXISTS public.patients_clinic_idx;
-- patients(dentist_id): keep patients_dentist_idx (147 scans), drop the dup (6)
DROP INDEX IF EXISTS public.idx_patients_dentist_id;

-- queue_entries(clinic_id, queue_date): THREE identical indexes existed. Keep
-- queue_entries_clinic_date_idx (735 scans); drop the two with 0 scans.
DROP INDEX IF EXISTS public.idx_queue_clinic_date;
DROP INDEX IF EXISTS public.idx_queue_entries_clinic_date;

-- visits(patient_id): keep idx_visits_patient_id (4680), drop the dup (119)
DROP INDEX IF EXISTS public.visits_patient_idx;
-- visits(dentist_id): keep idx_visits_dentist_id (1603), drop the dup (418)
DROP INDEX IF EXISTS public.visits_dentist_idx;

-- prescriptions(patient_id): keep idx_prescriptions_patient (590), drop the dup (1)
DROP INDEX IF EXISTS public.prescriptions_patient_idx;

-- treatment_plans: keep idx_treatment_plans_patient (patient_id, status — 413 scans,
-- covers patient_id lookups); drop the single-column redundant copy (9 scans)
DROP INDEX IF EXISTS public.treatment_plans_patient_idx;

-- ── Provably unused (idx_scan = 0) ─────────────────────────────────────────────

-- patients soft-delete uses is_deleted, not deleted_at, so this partial never matched.
DROP INDEX IF EXISTS public.idx_patients_active;
-- boolean column index, never used by the planner (low selectivity).
DROP INDEX IF EXISTS public.idx_patients_is_deleted;
-- single-column status index, superseded by idx_queue_entries_status (clinic_id,
-- queue_date, status) which has 5788 scans; this one has 0.
DROP INDEX IF EXISTS public.idx_queue_status;
