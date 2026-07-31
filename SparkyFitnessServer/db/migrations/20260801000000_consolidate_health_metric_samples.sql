-- Consolidate four row-per-sample wellness tables (heart_rate_entries, hrv_entries,
-- respiration_entries, spo2_entries) into one day-grain JSONB table,
-- health_metric_samples, and reshape exercise_entry_gps_points from
-- one-row-per-trackpoint to one-row-per-workout.
--
-- Why: projected growth at 10 users x 10 years under the old design was ~155M rows
-- (~40-70GB). Every chart reading these tables fetches one bounded unit whole (a
-- workout's GPS track, a day's HR trend) -- never a genuine cross-record SQL range
-- query, which is already served by daily_health_metrics's precomputed min/avg/max.
-- One-row-per-sample was solving a query pattern this app doesn't have.
--
-- See PLAN/high_frequency_telemetry_storage_redesign.md and
-- PLAN/telemetry_redesign_phase_1_database.md for full rationale.
--
-- Also adds 'stress' and 'body_battery' as new intraday metrics: Garmin already
-- sends both on every sync (stressValuesArray / bodyBatteryValuesArray) but the
-- server previously discarded them.

-- ============================================================================
-- 1. health_metric_samples
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
    CONSTRAINT uq_health_metric_samples
        UNIQUE (user_id, metric, entry_date, source_provider),
    -- Kept in sync BY HAND with shared/src/schemas/database/HealthMetricSamples.zod.ts's
    -- healthMetricSchema enum. Adding a 7th metric means editing both. See
    -- PLAN/telemetry_redesign_phase_2_shared_schemas.md for why both layers exist
    -- deliberately (DB backstop vs. app-boundary type guard).
    CONSTRAINT chk_health_metric_samples_metric CHECK (metric IN (
        'heart_rate', 'hrv', 'respiration', 'spo2', 'stress', 'body_battery'
    ))
);

CREATE INDEX IF NOT EXISTS idx_health_metric_samples_user_date
    ON health_metric_samples(user_id, metric, entry_date DESC);

-- ============================================================================
-- 2. Backfill from the four old tables
--    entry_date already exists on every row of every source table, and
--    exercise_entry_id/sleep_entry_id map directly into the in-sample ex/sl
--    keys -- no timestamp-window matching needed for historical data.
-- ============================================================================

INSERT INTO health_metric_samples
    (user_id, metric, entry_date, source_provider, device_name, samples)
SELECT
    user_id,
    'heart_rate',
    entry_date,
    source_provider,
    MIN(device_name),
    jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            't',  timestamp,
            'bpm', heart_rate_bpm,
            'context', NULLIF(context, 'unspecified'),
            'ex', exercise_entry_id,
            'sl', sleep_entry_id
        )) ORDER BY timestamp
    )
FROM heart_rate_entries
GROUP BY user_id, entry_date, source_provider
ON CONFLICT ON CONSTRAINT uq_health_metric_samples DO NOTHING;

INSERT INTO health_metric_samples
    (user_id, metric, entry_date, source_provider, device_name, samples)
SELECT
    user_id, 'hrv', entry_date, source_provider, MIN(device_name),
    jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            't', timestamp,
            'rmssd_ms', hrv_rmssd_ms,
            'sdnn_ms',  hrv_sdnn_ms,
            'status',   status,
            'ex', exercise_entry_id,
            'sl', sleep_entry_id
        )) ORDER BY timestamp
    )
FROM hrv_entries
GROUP BY user_id, entry_date, source_provider
ON CONFLICT ON CONSTRAINT uq_health_metric_samples DO NOTHING;

INSERT INTO health_metric_samples
    (user_id, metric, entry_date, source_provider, device_name, samples)
SELECT
    user_id, 'respiration', entry_date, source_provider, MIN(device_name),
    jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            't', timestamp,
            'brpm', breaths_per_minute,
            'context', NULLIF(context, 'unspecified'),
            'ex', exercise_entry_id,
            'sl', sleep_entry_id
        )) ORDER BY timestamp
    )
FROM respiration_entries
GROUP BY user_id, entry_date, source_provider
ON CONFLICT ON CONSTRAINT uq_health_metric_samples DO NOTHING;

INSERT INTO health_metric_samples
    (user_id, metric, entry_date, source_provider, device_name, samples)
SELECT
    user_id, 'spo2', entry_date, source_provider, MIN(device_name),
    jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            't', timestamp,
            'percentage', spo2_percentage,
            'ex', exercise_entry_id,
            'sl', sleep_entry_id
        )) ORDER BY timestamp
    )
FROM spo2_entries
GROUP BY user_id, entry_date, source_provider
ON CONFLICT ON CONSTRAINT uq_health_metric_samples DO NOTHING;

-- ============================================================================
-- 3. Drop the four old wellness tables (only after the backfill above)
-- ============================================================================

DROP TABLE IF EXISTS heart_rate_entries;
DROP TABLE IF EXISTS hrv_entries;
DROP TABLE IF EXISTS respiration_entries;
DROP TABLE IF EXISTS spo2_entries;

-- ============================================================================
-- 4. Reshape exercise_entry_gps_points: one row per trackpoint -> one row per
--    workout. Postgres can't GROUP BY an existing table into fewer rows via
--    plain ALTER, so this is create-new-shape -> copy -> drop-old -> rename,
--    ending on the original table name.
-- ============================================================================

CREATE TABLE exercise_entry_gps_points_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_gps_points UNIQUE (exercise_entry_id)
);

INSERT INTO exercise_entry_gps_points_new
    (user_id, exercise_entry_id, entry_date, points)
SELECT
    user_id,
    exercise_entry_id,
    MIN(entry_date),
    jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            't',      timestamp,
            'lat',    latitude,
            'lon',    longitude,
            'alt',    altitude_meters,
            'speed',  speed_mps,
            'hr',     heart_rate_bpm,
            'resp',   respiration_rate_brpm,
            'cad',    cadence,
            'power',  power_watts,
            'gct',    ground_contact_time_ms,
            'vo',     vertical_oscillation_mm,
            'stride', stride_length_cm,
            'temp',   temperature_celsius,
            'dist',   distance_meters,
            'hacc',   horizontal_accuracy_meters,
            'vacc',   vertical_accuracy_meters,
            'course', course_degrees
        )) ORDER BY timestamp
    )
FROM exercise_entry_gps_points
GROUP BY user_id, exercise_entry_id;

DROP TABLE exercise_entry_gps_points;
ALTER TABLE exercise_entry_gps_points_new RENAME TO exercise_entry_gps_points;

-- Indexing note: UNIQUE (exercise_entry_id) auto-creates a unique index, which
-- already covers the primary lookup (WHERE exercise_entry_id = $1, used by
-- GET /api/generic-health/workout-gps/:exerciseEntryId). This second index
-- serves the different "GPS-bearing workouts in a date range" query -- do not
-- add exercise_entry_id to it, that would be redundant with the unique index.
CREATE INDEX IF NOT EXISTS idx_exercise_entry_gps_points_user_date
    ON exercise_entry_gps_points(user_id, entry_date DESC);
