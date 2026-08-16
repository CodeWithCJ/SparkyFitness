-- Workout telemetry that arrives fractional was stored in integer columns, so a
-- single decimal value aborted the whole insert. On the mobile "Import History"
-- backfill that rejects the entire chunk, not just the offending session.
--
-- The values are fractional by design on both ends:
--   * Health Connect reports cadence and heart rate as averages (Double), and
--     declares FloorsClimbedRecord.floors as a Double outright.
--   * services/workoutTelemetryDerivation.ts rounds cadence to one decimal on
--     both paths — deriveWorkoutTelemetry() for avg_cadence and max_cadence,
--     deriveLaps() for avg_cadence (laps have no max_cadence column) — which the
--     integer columns could not hold either.
--
-- Widening is lossless, matches 20260628000000_convert_exercise_durations_to_numeric.sql,
-- and is a no-op where the column is already numeric. NUMERIC is parsed back to a
-- JS number by the parser registered in db/poolManager.ts, so API shapes are unchanged.

BEGIN;

ALTER TABLE exercise_entries
  ALTER COLUMN avg_heart_rate TYPE numeric,
  ALTER COLUMN max_heart_rate TYPE numeric,
  ALTER COLUMN avg_cadence    TYPE numeric,
  ALTER COLUMN max_cadence    TYPE numeric,
  ALTER COLUMN floors_climbed TYPE numeric;

ALTER TABLE exercise_entry_laps
  ALTER COLUMN avg_heart_rate TYPE numeric,
  ALTER COLUMN max_heart_rate TYPE numeric,
  ALTER COLUMN avg_cadence    TYPE numeric;

COMMIT;
