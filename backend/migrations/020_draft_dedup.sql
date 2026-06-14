-- 020_draft_dedup.sql
-- PILOT RELIABILITY: one consultation -> one draft -> one worker.
--
-- A double-tap of "Stop", a retried start-voice request, or a re-record racing the
-- previous run could create a SECOND in-flight consultation_draft for the same
-- queue entry -> two worker jobs, two Sarvam+Gemini bills, and a flickering card as
-- stale and fresh drafts both push realtime updates.
--
-- This migration has TWO parts:
--   PART A reconciles the EXISTING backlog of duplicate active drafts (pilot data
--          accumulated before the app-level guard existed), because the unique index
--          in PART B cannot be created while duplicates exist.
--   PART B creates the partial unique index that makes a second IN-FLIGHT draft for
--          the same queue entry impossible at the database level (the race-proof
--          backstop behind the app-level pre-check in voice.controller.js).
--
-- Only 'processing' and 'pending_review' drafts are "active" / constrained; once a
-- draft is confirmed / rejected / superseded / error it no longer blocks a fresh
-- consult (e.g. a legitimate re-record after an error).
--
-- This migration is IDEMPOTENT: re-running it is a no-op once reconciled.
-- Apply via Supabase SQL editor (or scripts/run-migration). Requires migration 014.

-- ── PART A: reconcile existing duplicate active drafts ──────────────────────────
-- For each queue entry with more than one active draft, keep ONE winner and demote
-- the rest to the terminal status 'superseded' (NOT deleted — these are unconfirmed
-- drafts; no clinical records were ever committed from them, and we keep gemini_raw
-- + transcript for the dataset). Winner = the draft the doctor is most likely to
-- want: a finished 'pending_review' beats a stuck 'processing', and within the same
-- status the most recently created wins.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY queue_entry_id
           ORDER BY (status = 'pending_review') DESC,  -- pending_review before processing
                    created_at DESC                    -- then newest first
         ) AS rn
  FROM public.consultation_drafts
  WHERE queue_entry_id IS NOT NULL
    AND status IN ('processing', 'pending_review')
)
UPDATE public.consultation_drafts d
SET status = 'superseded',
    error_code = COALESCE(d.error_code, 'SUPERSEDED'),
    error_detail = COALESCE(d.error_detail, 'Auto-reconciled: duplicate active draft for this queue entry (migration 020).'),
    updated_at = now()
FROM ranked
WHERE d.id = ranked.id
  AND ranked.rn > 1;   -- everything except the per-entry winner

-- ── PART B: prevent it recurring ────────────────────────────────────────────────
-- Partial unique index: at most one active draft per queue entry. queue_entry_id is
-- nullable (patient-profile consults have none); the WHERE clause excludes NULLs so
-- those are never constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_active_per_queue_entry
  ON public.consultation_drafts (queue_entry_id)
  WHERE queue_entry_id IS NOT NULL
    AND status IN ('processing', 'pending_review');
