-- Migration: Add DB-level unique constraint to sleep_entries (user_id, entry_date, source)
-- Created: 2026-03-28
--
-- Problem: sleep_entries has a source column (NOT NULL) and the repository enforces
-- per-source uniqueness in software (SELECT then INSERT/UPDATE). However there is no
-- DB-level constraint, so concurrent syncs or retries can insert duplicate rows for
-- the same (user_id, entry_date, source) triple, bypassing the software check.
--
-- Solution: Add a UNIQUE constraint at the DB level. This turns the software check
-- into a fast-path optimisation; the database is now the true authority.
--
-- Pre-condition: If duplicate (user_id, entry_date, source) rows already exist,
-- this migration will fail. The DO block below deduplicates them first by keeping
-- only the most recently updated row per triple.

BEGIN;

-- 1. Remove duplicate (user_id, entry_date, source) rows, keeping the latest updated_at
DELETE FROM public.sleep_entries
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, entry_date, source
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM public.sleep_entries
  ) ranked
  WHERE rn > 1
);

-- 2. Add the unique constraint
ALTER TABLE public.sleep_entries
  DROP CONSTRAINT IF EXISTS sleep_entries_user_date_source_unique;

ALTER TABLE public.sleep_entries
  ADD CONSTRAINT sleep_entries_user_date_source_unique
  UNIQUE (user_id, entry_date, source);

COMMIT;
