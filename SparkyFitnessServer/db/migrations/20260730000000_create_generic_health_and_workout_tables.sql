-- Migration: Create Generic Health, Telemetry and Workout Tables
-- Date: 2026-07-30

-- 1. Enhancing exercise_entries with workout & FIT telemetry
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
ADD COLUMN IF NOT EXISTS vo2_max_estimate NUMERIC(4, 1);

-- 2. Enhancing check_in_measurements with Smart Scale Composition
ALTER TABLE check_in_measurements
ADD COLUMN IF NOT EXISTS muscle_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bone_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS body_water_percentage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bmi NUMERIC(4, 1);

-- 3. exercise_entry_laps (Workout splits)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_laps_entry ON exercise_entry_laps(exercise_entry_id, lap_index);
CREATE INDEX IF NOT EXISTS idx_exercise_entry_laps_user_date ON exercise_entry_laps(user_id, entry_date DESC);

-- 4. exercise_entry_gps_points (Workout GPS trackpoints & telemetry)
CREATE TABLE IF NOT EXISTS exercise_entry_gps_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    altitude_meters NUMERIC(7, 2),
    speed_mps NUMERIC(6, 2),
    heart_rate_bpm INTEGER,
    respiration_rate_brpm NUMERIC(5, 2),
    cadence INTEGER,
    power_watts NUMERIC(6, 2),
    ground_contact_time_ms NUMERIC(5, 1),
    vertical_oscillation_mm NUMERIC(5, 1),
    stride_length_cm NUMERIC(5, 1),
    temperature_celsius NUMERIC(4, 1),
    distance_meters NUMERIC(10, 2),
    horizontal_accuracy_meters NUMERIC(6, 2),
    vertical_accuracy_meters NUMERIC(6, 2),
    course_degrees NUMERIC(5, 2)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_gps_time ON exercise_entry_gps_points(exercise_entry_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_exercise_entry_gps_user_date ON exercise_entry_gps_points(user_id, entry_date DESC, timestamp ASC);

-- 5. heart_rate_entries (Intraday continuous heart rate)
CREATE TABLE IF NOT EXISTS heart_rate_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    heart_rate_bpm INTEGER NOT NULL,
    context TEXT DEFAULT 'unspecified',
    sleep_entry_id UUID REFERENCES sleep_entries(id) ON DELETE SET NULL,
    exercise_entry_id UUID REFERENCES exercise_entries(id) ON DELETE SET NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_heart_rate_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_heart_rate_user_date ON heart_rate_entries(user_id, entry_date DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_heart_rate_sleep ON heart_rate_entries(sleep_entry_id) WHERE sleep_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_heart_rate_workout ON heart_rate_entries(exercise_entry_id) WHERE exercise_entry_id IS NOT NULL;

-- 6. hrv_entries (Intraday & overnight HRV)
CREATE TABLE IF NOT EXISTS hrv_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    hrv_rmssd_ms NUMERIC(6, 2),
    hrv_sdnn_ms NUMERIC(6, 2),
    status TEXT,
    sleep_entry_id UUID REFERENCES sleep_entries(id) ON DELETE SET NULL,
    exercise_entry_id UUID REFERENCES exercise_entries(id) ON DELETE SET NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_hrv_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_hrv_user_date ON hrv_entries(user_id, entry_date DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_hrv_sleep ON hrv_entries(sleep_entry_id) WHERE sleep_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hrv_workout ON hrv_entries(exercise_entry_id) WHERE exercise_entry_id IS NOT NULL;

-- 7. respiration_entries (Intraday breathing rate)
CREATE TABLE IF NOT EXISTS respiration_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    breaths_per_minute NUMERIC(5, 2) NOT NULL,
    context TEXT DEFAULT 'unspecified',
    sleep_entry_id UUID REFERENCES sleep_entries(id) ON DELETE SET NULL,
    exercise_entry_id UUID REFERENCES exercise_entries(id) ON DELETE SET NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_respiration_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_respiration_user_date ON respiration_entries(user_id, entry_date DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_respiration_sleep ON respiration_entries(sleep_entry_id) WHERE sleep_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_respiration_workout ON respiration_entries(exercise_entry_id) WHERE exercise_entry_id IS NOT NULL;

-- 8. spo2_entries (Pulse ox SpO2 %)
CREATE TABLE IF NOT EXISTS spo2_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    spo2_percentage NUMERIC(5, 2) NOT NULL,
    sleep_entry_id UUID REFERENCES sleep_entries(id) ON DELETE SET NULL,
    exercise_entry_id UUID REFERENCES exercise_entries(id) ON DELETE SET NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_spo2_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_spo2_user_date ON spo2_entries(user_id, entry_date DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spo2_sleep ON spo2_entries(sleep_entry_id) WHERE sleep_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spo2_workout ON spo2_entries(exercise_entry_id) WHERE exercise_entry_id IS NOT NULL;

-- 9. vitals_entries (Blood pressure, blood glucose, temperature)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_user_date ON vitals_entries(user_id, entry_date DESC, timestamp DESC);

-- 10. daily_health_metrics (Automated wearable daily summaries & scores)
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
