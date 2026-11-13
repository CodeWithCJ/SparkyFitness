-- Migration: Allow several sleep sessions per night and source
-- File: SparkyFitnessServer/db/migrations/20261028120000_allow_multiple_sleep_sessions_per_night.sql
--
-- A nap and the night before it share entry_date and source, so the unique
-- index on (user_id, entry_date, source) merged the nap into the night's entry
-- and its stages were left out of the night's totals (#3240). upsertSleepEntry
-- now matches a write to the same session (within the 4 hour stage cluster gap)
-- under an advisory lock, so a re-sync or two overlapping writes of a session
-- still update one row, and a separate session gets its own row.

DROP INDEX IF EXISTS public.sleep_entries_user_date_source_key;

CREATE INDEX IF NOT EXISTS idx_sleep_entries_user_date_source
  ON public.sleep_entries (user_id, entry_date, source);
