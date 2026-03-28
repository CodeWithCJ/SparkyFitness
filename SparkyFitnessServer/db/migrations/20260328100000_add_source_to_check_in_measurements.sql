-- Migration: Add source column and multi-source unique constraint to check_in_measurements
-- Created: 2026-03-28
--
-- Problem: check_in_measurements had no source column and a single-row-per-date constraint
-- (user_id, entry_date). When multiple integrations (Garmin, Withings, HealthKit) synced
-- data for the same date, the last write silently overwrote all previous data.
--
-- Solution: Follow the same pattern used for water_intake (20260313100000):
--   1. Add source column (default 'manual' for backward compatibility)
--   2. Backfill existing rows
--   3. Replace single-date unique constraint with per-source unique constraint
--
-- IMPORTANT: Withings and any other integration that runs DELETE before INSERT must
-- add AND source = '<provider>' to its WHERE clause after this migration, or it will
-- continue to delete rows from other sources.

BEGIN;

-- 1. Add source and audit columns
ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS source character varying(50) DEFAULT 'manual'::character varying;

ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;

-- 2. Backfill existing rows — all pre-migration data is treated as manual
UPDATE public.check_in_measurements
  SET source = 'manual'
  WHERE source IS NULL;

-- 3. Set NOT NULL now that all rows have a value
ALTER TABLE public.check_in_measurements
  ALTER COLUMN source SET NOT NULL;

-- 4. Drop any existing single-date unique constraints
--    (the table had an implicit single-row-per-date via application logic, not a named constraint,
--    but we drop both known possible names for safety)
ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_user_id_entry_date_key;

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_user_date_unique;

-- 5. Add the new multi-source unique constraint
ALTER TABLE public.check_in_measurements
  ADD CONSTRAINT check_in_measurements_user_date_source_unique
  UNIQUE (user_id, entry_date, source);

-- 6. Foreign keys for audit columns
ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_created_by_user_id_fkey,
  ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_updated_by_user_id_fkey,
  ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

COMMIT;
