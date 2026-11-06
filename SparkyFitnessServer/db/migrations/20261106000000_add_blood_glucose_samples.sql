-- Preserve timestamped CGM readings in the existing RLS-protected sample table.
ALTER TABLE health_metric_samples
    DROP CONSTRAINT IF EXISTS chk_health_metric_samples_metric;
ALTER TABLE health_metric_samples
    ADD CONSTRAINT chk_health_metric_samples_metric CHECK (metric IN (
        'heart_rate', 'hrv', 'respiration', 'spo2', 'stress', 'body_battery',
        'skin_temperature', 'blood_glucose'
    ));

-- Shared account display preference; readings remain stored in mmol/L.
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS default_glucose_unit TEXT NOT NULL DEFAULT 'mmol/L';
ALTER TABLE user_preferences
    DROP CONSTRAINT IF EXISTS chk_user_preferences_glucose_unit;
ALTER TABLE user_preferences
    ADD CONSTRAINT chk_user_preferences_glucose_unit
    CHECK (default_glucose_unit IN ('mmol/L', 'mg/dL'));

-- Bound timestamp-based custom CGM reads to one user's readings.
CREATE INDEX IF NOT EXISTS idx_custom_measurements_user_timestamp
    ON custom_measurements (user_id, entry_timestamp);
