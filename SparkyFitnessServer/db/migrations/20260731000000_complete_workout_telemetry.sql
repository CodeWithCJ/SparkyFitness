-- Migration: Complete workout telemetry (Garmin parity fixes)
-- Date: 2026-07-31
--
-- Fixes for the generic health/workout telemetry architecture introduced in
-- 20260730000000_create_generic_health_and_workout_tables.sql:
--   1. Adds the remaining Garmin-Connect-parity fields that had no column at all
--      (moving/elapsed/work time, resting vs active calories, avg moving speed,
--      min/max elevation, weather, gear).
--   2. Adds exercise_entry_hr_zones (time-in-heart-rate-zone splits), provider-neutral.
--   3. Adds the UNIQUE constraints exercise_entry_laps and exercise_entry_gps_points
--      were missing, so re-syncing an activity no longer appends duplicate rows.
--      Existing duplicate rows (if any) are removed first, keeping the earliest.

-- 1. Additional exercise_entries columns
ALTER TABLE exercise_entries
ADD COLUMN IF NOT EXISTS moving_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS elapsed_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS work_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS resting_calories NUMERIC(8, 2),
ADD COLUMN IF NOT EXISTS active_calories NUMERIC(8, 2),
ADD COLUMN IF NOT EXISTS avg_moving_speed_mps NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS min_elevation_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS max_elevation_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS weather_temp_celsius NUMERIC(4, 1),
ADD COLUMN IF NOT EXISTS weather_condition TEXT,
ADD COLUMN IF NOT EXISTS weather_wind_speed_mps NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS weather_humidity_percentage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS gear_name TEXT,
ADD COLUMN IF NOT EXISTS gear_external_id TEXT;

-- 2. exercise_entry_hr_zones (time-in-zone splits, provider-neutral)
CREATE TABLE IF NOT EXISTS exercise_entry_hr_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    zone_index INTEGER NOT NULL,
    zone_lower_bpm INTEGER,
    zone_upper_bpm INTEGER,
    seconds_in_zone INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_hr_zone UNIQUE (exercise_entry_id, zone_index)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_hr_zones_entry ON exercise_entry_hr_zones(exercise_entry_id, zone_index);
CREATE INDEX IF NOT EXISTS idx_exercise_entry_hr_zones_user_date ON exercise_entry_hr_zones(user_id, entry_date DESC);

-- 3. De-duplicate exercise_entry_laps before adding uniqueness (keep earliest row per key)
DELETE FROM exercise_entry_laps a
USING exercise_entry_laps b
WHERE a.exercise_entry_id = b.exercise_entry_id
  AND a.lap_index = b.lap_index
  AND a.id > b.id;

ALTER TABLE exercise_entry_laps
ADD CONSTRAINT uq_exercise_entry_lap UNIQUE (exercise_entry_id, lap_index);

-- 4. De-duplicate exercise_entry_gps_points before adding uniqueness (keep earliest row per key)
DELETE FROM exercise_entry_gps_points a
USING exercise_entry_gps_points b
WHERE a.exercise_entry_id = b.exercise_entry_id
  AND a.timestamp = b.timestamp
  AND a.id > b.id;

ALTER TABLE exercise_entry_gps_points
ADD CONSTRAINT uq_exercise_entry_gps_point UNIQUE (exercise_entry_id, timestamp);

-- 5. exercise_entry_gps_points was missing created_at, unlike every sibling telemetry table
ALTER TABLE exercise_entry_gps_points
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 6. vitals_entries was the one intraday telemetry table created without a uniqueness
-- constraint (heart_rate_entries, hrv_entries, respiration_entries, spo2_entries all have
-- one). Without it, bulkUpsertVitals has no ON CONFLICT target and duplicates every
-- blood-pressure reading on re-sync, so add it here to match its siblings.
DELETE FROM vitals_entries a
USING vitals_entries b
WHERE a.user_id = b.user_id
  AND a.source_provider = b.source_provider
  AND a.timestamp = b.timestamp
  AND a.id > b.id;

ALTER TABLE vitals_entries
ADD CONSTRAINT uq_vitals_entry UNIQUE (user_id, source_provider, timestamp);
