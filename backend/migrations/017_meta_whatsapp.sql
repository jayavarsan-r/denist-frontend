-- 017_meta_whatsapp.sql
-- Phase 5 Part A — direct Meta Cloud API WhatsApp provider.
--
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query), in numeric
-- order, AFTER 016. Idempotent — safe to re-run.
--
-- Each clinic registers its own WhatsApp number under DentAI's WABA. Meta assigns
-- a phone_number_id per number; the orchestrator sends from that id so messages go
-- out on the right clinic's number. NULL → provider falls back to the
-- META_PHONE_NUMBER_ID env var (fine for single-clinic / dev). Set manually per
-- clinic after WABA registration.

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_phone_number_id text;
