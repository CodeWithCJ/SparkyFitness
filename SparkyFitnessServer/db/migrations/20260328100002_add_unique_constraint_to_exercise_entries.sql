-- Migration: Add DB-level partial unique index to exercise_entries (user_id, source, source_id)
-- Created: 2026-03-28
--
-- Problem: exercise_entries has source and source_id columns but no DB uniqueness guarantee.
-- The repository deduplicates in software via a SELECT before INSERT. Concurrent syncs or
-- retries can insert the same external activity twice (e.g. same Garmin activity ID appears
-- twice), doubling calorie totals in the daily dashboard.
--
-- A partial index (WHERE source_id IS NOT NULL) is used rather than a full unique constraint
-- because manual entries legitimately have source_id = NULL and can share the same
-- (user_id, source) without conflict.
--
-- Pre-condition: Deduplicate existing rows with identical (user_id, source, source_id)
-- before adding the index, keeping the most recently updated row.

BEGIN;

-- 1. Remove duplicate (user_id, source, source_id) rows where source_id is not null,
--    keeping the row with the latest updated_at
DELETE FROM public.exercise_entries
WHERE source_id IS NOT NULL
  AND id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, source, source_id
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        ) AS rn
      FROM public.exercise_entries
      WHERE source_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  );

-- 2. Add partial unique index
DROP INDEX IF EXISTS exercise_entries_user_source_source_id_unique;

CREATE UNIQUE INDEX exercise_entries_user_source_source_id_unique
  ON public.exercise_entries (user_id, source, source_id)
  WHERE source_id IS NOT NULL;

COMMIT;
