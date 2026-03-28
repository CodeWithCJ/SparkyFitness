-- Migration: add start_time to exercise_entries
-- Stores the actual workout start timestamp so cross-source duplicate detection
-- can match overlapping sessions from different integrations (e.g. HealthKit vs Withings).

ALTER TABLE public.exercise_entries
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;

-- Back-fill: derive a rough start_time from entry_date for existing rows that
-- have no timestamp. Keeps historical data queryable without breaking anything.
UPDATE public.exercise_entries
  SET start_time = entry_date::timestamptz
  WHERE start_time IS NULL;

-- Index for fast overlap lookups used by the cross-source deduplication query.
CREATE INDEX IF NOT EXISTS exercise_entries_user_date_start_time_idx
  ON public.exercise_entries (user_id, entry_date, start_time);
