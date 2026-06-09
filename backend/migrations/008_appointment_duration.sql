-- ============================================================================
-- Migration 008 — appointment duration
-- ============================================================================
-- Run in the Supabase SQL editor. Idempotent.
--
-- Lets the calendar render appointments at their true length (e.g. RCT 60 min,
-- Implant 90 min) instead of a fixed 30-minute block. Existing rows default to 30.
-- ============================================================================

alter table public.appointments
  add column if not exists duration_minutes int not null default 30;
