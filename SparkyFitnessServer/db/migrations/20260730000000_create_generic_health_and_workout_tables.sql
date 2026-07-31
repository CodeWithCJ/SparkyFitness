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
ADD COLUMN IF NOT EXISTS muscle_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bone_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS body_water_percentage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bmi NUMERIC(4, 1);

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
    CONSTRAINT uq_exercise_entry_lap UNIQUE (exercise_entry_id, lap_index)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_laps_entry ON exercise_entry_laps(exercise_entry_id, lap_index);
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
    CONSTRAINT uq_exercise_entry_hr_zone UNIQUE (exercise_entry_id, zone_index)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_hr_zones_entry ON exercise_entry_hr_zones(exercise_entry_id, zone_index);
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

CREATE INDEX IF NOT EXISTS idx_health_metric_samples_user_date ON health_metric_samples(user_id, metric, entry_date DESC);

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

CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_date ON daily_health_metrics(user_id, entry_date DESC);

-- Clean up any legacy table references from pre-consolidation dev runs
DROP TABLE IF EXISTS heart_rate_entries, hrv_entries, respiration_entries, spo2_entries;
