-- ════════════════════════════════════════════════════════════════════════════
-- 003 — CLINIC SETTINGS COLUMNS  (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
-- PATCH /api/clinic already writes these columns (clinic.routes.js), but they do
-- not exist on the live clinics table — so that endpoint errors today whenever
-- address/phone/hours are submitted. This adds them.

alter table public.clinics add column if not exists address      text;
alter table public.clinics add column if not exists phone        text;
alter table public.clinics add column if not exists open_time    text;   -- 'HH:MM'
alter table public.clinics add column if not exists close_time   text;   -- 'HH:MM'
alter table public.clinics add column if not exists working_days  jsonb default '[]'::jsonb; -- e.g. ["mon","tue",...]
