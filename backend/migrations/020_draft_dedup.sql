-- 020_draft_dedup.sql
-- PILOT RELIABILITY: one consultation -> one draft -> one worker.
--
-- A double-tap of "Stop", a retried start-voice request, or a re-record racing the
-- previous run could create a SECOND in-flight consultation_draft for the same
-- queue entry -> two worker jobs, two Sarvam+Gemini bills, and a flickering card as
-- stale and fresh drafts both push realtime updates.
--
-- This partial unique index makes a second IN-FLIGHT draft for the same queue entry
-- impossible at the database level (the race-proof backstop behind the app-level
-- pre-check in voice.controller.js). Only 'processing' and 'pending_review' drafts
-- are constrained; once a draft is confirmed / rejected / error it no longer blocks
-- a fresh consult (e.g. a legitimate re-record after an error).
--
-- queue_entry_id is nullable (patient-profile consults have none); the WHERE clause
-- excludes NULLs so those are never constrained.
--
-- Apply via Supabase SQL editor. Requires migration 014 (consultation_drafts).

CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_active_per_queue_entry
  ON public.consultation_drafts (queue_entry_id)
  WHERE queue_entry_id IS NOT NULL
    AND status IN ('processing', 'pending_review');
