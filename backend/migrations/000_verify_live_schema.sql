-- ════════════════════════════════════════════════════════════════════════════
-- 000 — VERIFY LIVE SCHEMA  (READ-ONLY — run this FIRST)
-- ════════════════════════════════════════════════════════════════════════════
-- Run each query in the Supabase SQL Editor and compare against expectations.
-- The committed supabase_schema.sql is AHEAD of some live deployments, so this
-- confirms exactly which migrations are actually needed before you apply them.
-- Nothing here writes data.

-- 1. Columns the app reads/writes that may be missing on older deployments.
--    Expect a row for each. A MISSING row => the corresponding migration is needed.
select table_name, column_name, data_type, is_generated
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'prescriptions' and column_name in ('follow_up', 'clinic_id')) or
    (table_name = 'appointments'  and column_name in ('sitting_number', 'clinic_id', 'status')) or
    (table_name = 'visits'        and column_name in ('sitting_number', 'clinic_id')) or
    (table_name = 'patients'      and column_name in ('clinical_flags', 'deleted_at')) or
    (table_name = 'clinics'       and column_name in ('address', 'phone', 'open_time', 'close_time', 'working_days'))
  )
order by table_name, column_name;

-- 2. CRITICAL: is treatment_plans.pending_amount a GENERATED column?
--    is_generated = 'ALWAYS'  => app code must NOT write pending_amount (DB computes it).
--    is_generated = 'NEVER'   => app code MUST keep recalculating pending_amount.
--    This decides migration 006 and how payments/treatment-plan code behaves.
select column_name, data_type, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name = 'treatment_plans'
  and column_name in ('pending_amount', 'collected_amount', 'estimated_cost');

-- 3. Does the audit_logs table already exist? (expect 0 rows on current deployments)
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'audit_logs';

-- 4. Existing soft-delete columns (expect patients.is_deleted only, pre-migration)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name in ('is_deleted', 'deleted_at', 'deleted_by')
order by table_name, column_name;
