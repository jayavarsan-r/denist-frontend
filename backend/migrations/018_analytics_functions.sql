-- 018_analytics_functions.sql
-- Phase 5 Part B7 — finance analytics. Backs GET /api/analytics/lab-turnaround.
--
-- Run in the Supabase SQL Editor, after 017. Idempotent (CREATE OR REPLACE).
--
-- Average turnaround (days from the SENT event to the RECEIVED event) per lab,
-- over cases SENT in the last `p_since` window. medicine-spend needs no function —
-- it's a plain stock_movements aggregate in the route.

CREATE OR REPLACE FUNCTION lab_turnaround_stats(p_clinic_id uuid, p_since timestamptz)
RETURNS TABLE (lab_name text, avg_days numeric, case_count bigint)
LANGUAGE sql AS $$
  WITH sent AS (
    SELECT lce.lab_case_id, MIN(lce.created_at) AS sent_at
    FROM lab_case_events lce
    JOIN lab_cases lc ON lc.id = lce.lab_case_id
    WHERE lc.clinic_id = p_clinic_id AND lce.to_status = 'SENT' AND lce.created_at >= p_since
    GROUP BY lce.lab_case_id
  ),
  received AS (
    SELECT lce.lab_case_id, MIN(lce.created_at) AS received_at
    FROM lab_case_events lce
    JOIN lab_cases lc ON lc.id = lce.lab_case_id
    WHERE lc.clinic_id = p_clinic_id AND lce.to_status = 'RECEIVED'
    GROUP BY lce.lab_case_id
  )
  SELECT
    l.name AS lab_name,
    ROUND(AVG(EXTRACT(EPOCH FROM (r.received_at - s.sent_at)) / 86400)::numeric, 1) AS avg_days,
    COUNT(*) AS case_count
  FROM sent s
  JOIN received r ON r.lab_case_id = s.lab_case_id
  JOIN lab_cases lc ON lc.id = s.lab_case_id
  JOIN labs l ON l.id = lc.lab_id
  GROUP BY l.name
  ORDER BY avg_days ASC;
$$;
