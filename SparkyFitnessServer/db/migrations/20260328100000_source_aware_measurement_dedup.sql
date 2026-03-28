-- Migration: Source-aware deduplication for measurements, sleep entries, and exercise entries
-- Created: 2026-03-28
--
-- PART 1: Add source column and multi-source unique constraint to check_in_measurements
-- Problem: check_in_measurements had no source column and a single-row-per-date constraint
-- (user_id, entry_date). When multiple integrations (Garmin, Withings, HealthKit) synced
-- data for the same date, the last write silently overwrote all previous data.
--
-- PART 2: Add DB-level unique constraint to sleep_entries (user_id, entry_date, source)
-- Problem: sleep_entries has no DB-level uniqueness guarantee; concurrent syncs can
-- insert duplicate rows for the same (user_id, entry_date, source) triple.
--
-- PART 3: Add DB-level partial unique index to exercise_entries (user_id, source, source_id)
-- Problem: Concurrent syncs or retries can insert the same external activity twice,
-- doubling calorie totals in the daily dashboard.

BEGIN;

-- ============================================================
-- PART 1: check_in_measurements
-- ============================================================

ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS source character varying(50) DEFAULT 'manual'::character varying;

ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;

UPDATE public.check_in_measurements
  SET source = 'manual'
  WHERE source IS NULL;

ALTER TABLE public.check_in_measurements
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_user_id_entry_date_key;

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_user_date_unique;

ALTER TABLE public.check_in_measurements
  ADD CONSTRAINT check_in_measurements_user_date_source_unique
  UNIQUE (user_id, entry_date, source);

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_created_by_user_id_fkey,
  ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_updated_by_user_id_fkey,
  ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

-- ============================================================
-- PART 2: sleep_entries
-- ============================================================

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

ALTER TABLE public.sleep_entries
  DROP CONSTRAINT IF EXISTS sleep_entries_user_date_source_unique;

ALTER TABLE public.sleep_entries
  ADD CONSTRAINT sleep_entries_user_date_source_unique
  UNIQUE (user_id, entry_date, source);

-- ============================================================
-- PART 3: exercise_entries
-- ============================================================

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

DROP INDEX IF EXISTS exercise_entries_user_source_source_id_unique;

CREATE UNIQUE INDEX exercise_entries_user_source_source_id_unique
  ON public.exercise_entries (user_id, source, source_id)
  WHERE source_id IS NOT NULL;

COMMIT;
