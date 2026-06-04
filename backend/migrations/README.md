# Database Migrations

These run in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query). They
are **not** applied by the Node backend. Run them **in numeric order**.

Every DDL migration is **idempotent** (`IF NOT EXISTS` / `add column if not exists`),
because the live database is, in places, behind the committed `../supabase_schema.sql`.
Re-running a migration is safe.

| File | What | When to run |
|------|------|-------------|
| `000_verify_live_schema.sql` | **Read-only.** Diffs live DB vs expectations. | **First.** Decides 001/006. |
| `001_missing_columns.sql` | `prescriptions.follow_up`, `clinic_id` + `sitting_number` columns, `clinical_flags` | Before deploying the Security Pass code. |
| `002_indexes.sql` | Performance indexes | After 001. |
| `003_clinic_settings.sql` | `clinics.address/phone/open_time/close_time/working_days` (PATCH /clinic writes these) | Before clinic settings are edited. |
| `004_soft_delete.sql` | `deleted_at`/`deleted_by` + backfill; keeps `is_deleted` | Phase 5 (repository pass) — safe earlier. |
| `005_audit_logs.sql` | `audit_logs` table | Phase 5. |
| `006_pending_amount_DECIDE.sql` | **Guidance, not auto-run.** Resolve generated-vs-plain `pending_amount`. | After reading 000 result. |

## Order of operations for this Security Pass
1. Run `000` and record the results (especially the `pending_amount` `is_generated` value).
2. Run `001`, `002`, `003`.
3. Deploy the Security Pass backend code.
4. `004`/`005` can run now or alongside Phase 5; the code tolerates their absence
   (soft-delete still uses `is_deleted`; audit writes are best-effort no-ops if the
   table is missing).
