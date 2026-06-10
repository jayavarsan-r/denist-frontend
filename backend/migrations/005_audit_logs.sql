-- ════════════════════════════════════════════════════════════════════════════
-- 005 — AUDIT LOGS  (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
-- Append-only audit trail. Writes are best-effort: an audit failure must never
-- fail the business operation (see services/audit.service.js). Everything is
-- clinic-scoped.

create table if not exists public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  clinic_id   uuid references public.clinics(id) on delete cascade,
  staff_id    uuid references public.staff(id) on delete set null,
  action      text not null,            -- CREATE | UPDATE | DELETE | PAYMENT | PRESCRIPTION | ROLE_CHANGE | QUEUE_REORDER | CONSULTATION | CHECKOUT
  entity_type text not null,            -- 'patient' | 'visit' | 'payment' | ...
  entity_id   uuid,
  metadata    jsonb,                    -- small diff/context payload, never PHI dumps
  request_id  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_clinic on public.audit_logs (clinic_id, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
