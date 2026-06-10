-- ════════════════════════════════════════════════════════════════════════════
-- 009 — CLINIC SETTINGS BAG  (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
-- A flexible per-clinic preferences object. First use: `receptionistCanAddMedicines`
-- — a doctor-managed toggle that lets receptionists add medicines (PATCH /api/clinic/settings).
-- Apply once in the Supabase SQL editor.

alter table public.clinics add column if not exists settings jsonb not null default '{}'::jsonb;
