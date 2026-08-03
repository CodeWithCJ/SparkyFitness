-- Migration: Create Generic Health, Telemetry and Workout Tables (Consolidated)
-- Date: 2026-07-30
--
-- Consolidated migration combining workout telemetry enhancement, lap splits,
-- heart rate zones, daily health metrics, vitals, GPS trackpoints, and
-- consolidated health metric samples.

-- ============================================================================
-- 1. Enhancing exercise_entries with workout & FIT telemetry
-- ============================================================================
ALTER TABLE exercise_entries
ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER,
ADD COLUMN IF NOT EXISTS heart_rate_recovery_1min INTEGER,
ADD COLUMN IF NOT EXISTS avg_respiration_brpm NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS max_respiration_brpm NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS avg_speed_mps NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS max_speed_mps NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS avg_cadence INTEGER,
ADD COLUMN IF NOT EXISTS max_cadence INTEGER,
ADD COLUMN IF NOT EXISTS avg_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS max_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS normalized_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS tss_score NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS intensity_factor NUMERIC(4, 3),
ADD COLUMN IF NOT EXISTS ground_contact_time_ms NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS vertical_oscillation_mm NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS stride_length_cm NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS avg_temperature_celsius NUMERIC(4, 1),
ADD COLUMN IF NOT EXISTS max_temperature_celsius NUMERIC(4, 1),
ADD COLUMN IF NOT EXISTS elevation_gain_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS elevation_loss_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS floors_climbed INTEGER,
ADD COLUMN IF NOT EXISTS stroke_count INTEGER,
ADD COLUMN IF NOT EXISTS training_load NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS aerobic_training_effect NUMERIC(3, 1),
ADD COLUMN IF NOT EXISTS anaerobic_training_effect NUMERIC(3, 1),
ADD COLUMN IF NOT EXISTS vo2_max_estimate NUMERIC(4, 1),
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

-- ============================================================================
-- 2. Enhancing check_in_measurements with Smart Scale Composition
-- ============================================================================
ALTER TABLE check_in_measurements
-- Measured smart-scale values only. BMI is deliberately absent: it is derived
-- from weight and height, both already stored here, and is computed at the
-- point of use (see bodyCompositionService). Persisting it would let a stored
-- value drift out of sync the moment weight changes.
ADD COLUMN IF NOT EXISTS muscle_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bone_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS body_water_percentage NUMERIC(5, 2);

-- ============================================================================
-- 3. exercise_entry_laps (Workout splits & lap telemetry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS exercise_entry_laps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    lap_index INTEGER NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER NOT NULL,
    distance_meters NUMERIC(10, 2),
    calories NUMERIC(8, 2),
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    avg_respiration_brpm NUMERIC(5, 2),
    max_respiration_brpm NUMERIC(5, 2),
    avg_speed_mps NUMERIC(6, 2),
    max_speed_mps NUMERIC(6, 2),
    avg_cadence INTEGER,
    avg_power_watts NUMERIC(6, 2),
    elevation_gain_meters NUMERIC(7, 2),
    elevation_loss_meters NUMERIC(7, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_lap UNIQUE (exercise_entry_id, lap_index)
);

-- No idx_..._entry index here: uq_exercise_entry_lap already backs
-- (exercise_entry_id, lap_index) with a unique btree index. The DROP is for
-- databases that ran an earlier revision of this migration, which did create
-- it; on a fresh install it is a no-op.
DROP INDEX IF EXISTS idx_exercise_entry_laps_entry;
CREATE INDEX IF NOT EXISTS idx_exercise_entry_laps_user_date ON exercise_entry_laps(user_id, entry_date DESC);

-- ============================================================================
-- 4. exercise_entry_hr_zones (Time-in-heart-rate-zone splits)
-- ============================================================================
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_hr_zone UNIQUE (exercise_entry_id, zone_index)
);

-- No idx_..._entry index here: uq_exercise_entry_hr_zone already backs
-- (exercise_entry_id, zone_index) with a unique btree index.
DROP INDEX IF EXISTS idx_exercise_entry_hr_zones_entry;
CREATE INDEX IF NOT EXISTS idx_exercise_entry_hr_zones_user_date ON exercise_entry_hr_zones(user_id, entry_date DESC);

-- ============================================================================
-- 5. exercise_entry_gps_points (Workout GPS trackpoints & telemetry - 1 row per workout)
-- ============================================================================
CREATE TABLE IF NOT EXISTS exercise_entry_gps_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_gps_points UNIQUE (exercise_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_gps_points_user_date ON exercise_entry_gps_points(user_id, entry_date DESC);

-- ============================================================================
-- 6. health_metric_samples (Consolidated intraday 24/7 wellness metrics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_metric_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    entry_date DATE NOT NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    samples JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_health_metric_samples UNIQUE (user_id, metric, entry_date, source_provider),
    CONSTRAINT chk_health_metric_samples_metric CHECK (metric IN (
        'heart_rate', 'hrv', 'respiration', 'spo2', 'stress', 'body_battery'
    ))
);

-- No separate (user_id, metric, entry_date) index: uq_health_metric_samples is
-- (user_id, metric, entry_date, source_provider), and its unique btree already
-- serves every leading-column lookup we issue.
DROP INDEX IF EXISTS idx_health_metric_samples_user_date;

-- ============================================================================
-- 7. vitals_entries (Blood pressure, blood glucose, temperature)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vitals_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    systolic_mmhg NUMERIC(5, 1),
    diastolic_mmhg NUMERIC(5, 1),
    blood_glucose_mgdl NUMERIC(5, 1),
    body_temperature_celsius NUMERIC(4, 2),
    meal_context TEXT,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_vitals_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_vitals_user_date ON vitals_entries(user_id, entry_date DESC, timestamp DESC);

-- ============================================================================
-- 8. daily_health_metrics (Automated wearable daily summaries & scores)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    total_steps INTEGER,
    step_goal INTEGER,
    total_distance_meters NUMERIC(10, 2),
    floors_ascended INTEGER,
    floors_descended INTEGER,
    active_calories NUMERIC(8, 2),
    bmr_calories NUMERIC(8, 2),
    total_calories NUMERIC(8, 2),
    highly_active_seconds INTEGER,
    active_seconds INTEGER,
    sedentary_seconds INTEGER,
    moderate_intensity_minutes INTEGER,
    vigorous_intensity_minutes INTEGER,
    exercise_minutes INTEGER,
    stand_hours INTEGER,
    resting_heart_rate INTEGER,
    heart_rate_recovery_1min INTEGER,
    vo2_max NUMERIC(4, 1),
    fitness_age NUMERIC(4, 1),
    lactate_threshold_bpm INTEGER,
    lactate_threshold_speed_mps NUMERIC(6, 2),
    walking_asymmetry_percentage NUMERIC(5, 2),
    hill_score INTEGER,
    race_prediction_5k_seconds INTEGER,
    race_prediction_10k_seconds INTEGER,
    race_prediction_half_marathon_seconds INTEGER,
    race_prediction_marathon_seconds INTEGER,
    recovery_time_hours INTEGER,
    training_readiness_score INTEGER,
    endurance_score INTEGER,
    weekly_training_load NUMERIC(7, 2),
    acute_training_load NUMERIC(7, 2),
    chronic_training_load NUMERIC(7, 2),
    acwr_ratio NUMERIC(4, 2),
    avg_stress_level INTEGER,
    max_stress_level INTEGER,
    body_battery_charged INTEGER,
    body_battery_drained INTEGER,
    body_battery_highest INTEGER,
    body_battery_lowest INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_daily_health_metrics UNIQUE (user_id, entry_date, source_provider)
);

-- No separate (user_id, entry_date) index: uq_daily_health_metrics is
-- (user_id, entry_date, source_provider) and its unique btree covers the prefix.
DROP INDEX IF EXISTS idx_daily_health_metrics_user_date;

-- ============================================================================
-- 9. updated_at maintenance across the new tables
-- ============================================================================
-- The CREATE TABLE statements above declare updated_at, but they are all
-- CREATE TABLE IF NOT EXISTS: on an installation where these tables were
-- created by an earlier run of this migration, the whole statement is skipped
-- and the new column never appears. The ALTERs below are what actually add it
-- there, and are no-ops on a fresh install.
--
-- The same applies to uq_vitals_entry, which is declared inline on
-- vitals_entries and so is likewise skipped on a pre-existing table. Without it
-- the vitals upsert has no ON CONFLICT target.
--
-- Triggers reuse update_updated_at_column(), defined in
-- 20250713125323_create_oidc_settings_and_update_users_table.sql.

ALTER TABLE exercise_entry_laps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE exercise_entry_hr_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE exercise_entry_gps_points ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE vitals_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    -- conname is only unique per table, so the relation has to be part of the
    -- predicate: a same-named constraint on any other table would otherwise
    -- make this skip and leave the vitals upsert without an ON CONFLICT target.
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_vitals_entry'
      AND conrelid = 'public.vitals_entries'::regclass
  ) THEN
    ALTER TABLE vitals_entries
      ADD CONSTRAINT uq_vitals_entry UNIQUE (user_id, source_provider, "timestamp");
  END IF;
END $$;

CREATE OR REPLACE TRIGGER update_health_metric_samples_updated_at
BEFORE UPDATE ON health_metric_samples
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_daily_health_metrics_updated_at
BEFORE UPDATE ON daily_health_metrics
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_exercise_entry_laps_updated_at
BEFORE UPDATE ON exercise_entry_laps
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_exercise_entry_hr_zones_updated_at
BEFORE UPDATE ON exercise_entry_hr_zones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_exercise_entry_gps_points_updated_at
BEFORE UPDATE ON exercise_entry_gps_points
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_vitals_entries_updated_at
BEFORE UPDATE ON vitals_entries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 10. Move provider-synced smart-scale composition into check_in_measurements
-- ============================================================================
-- Depends on the muscle_mass_kg / bone_mass_kg / body_water_percentage columns
-- added in section 2, so it must stay after that.
--
-- Garmin, Withings, and the Health Connect mobile sync historically wrote
-- muscle mass, bone mass, and body water to auto-created custom_measurements
-- categories. All of them now write these columns directly, so this moves their
-- existing history across to keep each user's charts continuous. Re-running is
-- a no-op: migrated rows are gone from custom_measurements, so the second pass
-- matches nothing.
--
-- Scoping is by cm.source, NOT by category measurement_type:
--   * measurement_type is unreliable here. Withings hardcodes 'health' when
--     creating the category (withingsDataProcessor.ts) while the Garmin path
--     stores the mapping's unit ('kg'), so the same logical category carries
--     different types depending on which provider created it first.
--   * source is what tells us the units are trustworthy: these rows came from a
--     provider mapping that guarantees kg. Manual rows are whatever unit the
--     user had in mind, so they are never touched — a hand-kept "Muscle Mass"
--     category in lbs survives this migration intact.
--   * the in-scope sources differ per metric (see the VALUES list below), so
--     each row carries its own source allowlist rather than sharing one.
--
-- Safety properties:
--   * COALESCE on conflict: an existing check-in value always wins. This only
--     fills gaps, it never overwrites what the user already recorded.
--   * A row is deleted ONLY when its own value is verifiably present in the
--     target column for that user and date. Rows that lost the COALESCE, extra
--     same-day rows that were not the one copied, and non-numeric values are
--     all left in place rather than destroyed.
--   * The numeric cast is guarded by CASE, so a non-numeric value yields NULL
--     instead of aborting the migration (WHERE clause evaluation order is not
--     guaranteed, so a bare `value::numeric` alongside a regex test is unsafe).
--
-- Emptied categories are intentionally left behind for the user to remove.

DO $$
DECLARE
  metric RECORD;
  -- Only numeric text is considered; anything else is skipped, not deleted.
  numeric_pattern CONSTANT text := '^[0-9]+(\.[0-9]+)?$';
BEGIN
  FOR metric IN
    SELECT *
    FROM (VALUES
      -- category names (lowercased), target column, max plausible value, sources
      --
      -- Category names are matched lowercased because each writer named the
      -- category differently: the provider mappings use a display name
      -- ('Bone Mass'), while the mobile health-data path names the category
      -- after the raw incoming type (customMeasurementHandleBatch passes
      -- entry.type straight to resolveCategory), so Health Connect bone mass
      -- landed under 'bone_mass'.
      --
      -- The mass ceilings are the largest value numeric(5,2) can hold. A higher
      -- bound would let an out-of-range provider value pass the filter and then
      -- fail the INSERT with a numeric overflow, aborting the whole migration.
      (ARRAY['muscle mass', 'muscle_mass'],
       'muscle_mass_kg',        999.99::numeric,
       ARRAY['garmin', 'withings']),
      -- Health Connect is in scope for bone mass only: BoneMass is the one
      -- smart-scale record type the mobile app syncs (SparkyFitnessMobile/src/
      -- HealthMetrics.ts), it is Android-only (HealthKit has no equivalent),
      -- and it always arrives in kg.
      (ARRAY['bone mass', 'bone_mass', 'bonemass'],
       'bone_mass_kg',          999.99::numeric,
       ARRAY['garmin', 'withings', 'health connect']),
      -- Garmin-only. Withings reports water as MASS in kg ('Hydration', and
      -- 'Body Water Breakdown' for extra/intracellular), never a percentage,
      -- so those categories are deliberately out of scope here.
      (ARRAY['body water percentage', 'body_water_percentage'],
       'body_water_percentage',   100::numeric,
       ARRAY['garmin'])
    ) AS t(category_names, column_name, max_value, sources)
  LOOP
    -- 1. Copy the latest provider value per user and day into the column.
    EXECUTE format(
      $sql$
      WITH candidate AS (
        SELECT cm.user_id,
               cm.entry_date,
               cm.entry_timestamp,
               CASE WHEN cm.value ~ %L THEN round(cm.value::numeric, 2) END AS value
        FROM custom_measurements cm
        JOIN custom_categories cc ON cc.id = cm.category_id
        WHERE lower(cc.name) = ANY(%L::text[])
          AND lower(cm.source) = ANY(%L::text[])
      ),
      picked AS (
        SELECT DISTINCT ON (user_id, entry_date) user_id, entry_date, value
        FROM candidate
        WHERE value IS NOT NULL AND value > 0 AND value <= %L
        ORDER BY user_id, entry_date, entry_timestamp DESC
      )
      INSERT INTO check_in_measurements (user_id, entry_date, %I)
      SELECT user_id, entry_date, value FROM picked
      ON CONFLICT (user_id, entry_date) DO UPDATE
        SET %I = COALESCE(check_in_measurements.%I, EXCLUDED.%I)
      $sql$,
      numeric_pattern, metric.category_names, metric.sources, metric.max_value,
      metric.column_name, metric.column_name, metric.column_name, metric.column_name
    );

    -- 2. Remove only the rows whose value demonstrably landed in the column.
    EXECUTE format(
      $sql$
      DELETE FROM custom_measurements cm
      USING custom_categories cc, check_in_measurements ci
      WHERE cc.id = cm.category_id
        AND lower(cc.name) = ANY(%L::text[])
        AND lower(cm.source) = ANY(%L::text[])
        AND ci.user_id = cm.user_id
        AND ci.entry_date = cm.entry_date
        AND ci.%I IS NOT NULL
        AND ci.%I = round((CASE WHEN cm.value ~ %L THEN cm.value END)::numeric, 2)
      $sql$,
      metric.category_names, metric.sources, metric.column_name,
      metric.column_name, numeric_pattern
    );
  END LOOP;
END $$;
