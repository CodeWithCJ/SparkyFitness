-- Add new columns to the sleep_entries table for more detailed sleep data
ALTER TABLE sleep_entries
ADD COLUMN IF NOT EXISTS deep_sleep_seconds INTEGER,
ADD COLUMN IF NOT EXISTS light_sleep_seconds INTEGER,
ADD COLUMN IF NOT EXISTS rem_sleep_seconds INTEGER,
ADD COLUMN IF NOT EXISTS awake_sleep_seconds INTEGER,
ADD COLUMN IF NOT EXISTS average_spo2_value NUMERIC,
ADD COLUMN IF NOT EXISTS lowest_spo2_value NUMERIC,
ADD COLUMN IF NOT EXISTS highest_spo2_value NUMERIC,
ADD COLUMN IF NOT EXISTS average_respiration_value NUMERIC,
ADD COLUMN IF NOT EXISTS lowest_respiration_value NUMERIC,
ADD COLUMN IF NOT EXISTS highest_respiration_value NUMERIC,
ADD COLUMN IF NOT EXISTS awake_count INTEGER,
ADD COLUMN IF NOT EXISTS avg_sleep_stress NUMERIC,
ADD COLUMN IF NOT EXISTS restless_moments_count INTEGER,
ADD COLUMN IF NOT EXISTS avg_overnight_hrv NUMERIC,
ADD COLUMN IF NOT EXISTS body_battery_change NUMERIC,
ADD COLUMN IF NOT EXISTS resting_heart_rate NUMERIC;
