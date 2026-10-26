-- Migration: Add resting_heart_rate to check_in_measurements and pulse_bpm to vitals_entries
-- Date: 2026-10-23
-- Purpose: Support daily manual check-in of resting heart rate and recording pulse alongside blood pressure readings.

ALTER TABLE check_in_measurements
ADD COLUMN IF NOT EXISTS resting_heart_rate SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_in_measurements_resting_heart_rate_check'
  ) THEN
    ALTER TABLE check_in_measurements
    ADD CONSTRAINT check_in_measurements_resting_heart_rate_check
    CHECK (resting_heart_rate IS NULL OR resting_heart_rate BETWEEN 25 AND 250);
  END IF;
END $$;

ALTER TABLE vitals_entries
ADD COLUMN IF NOT EXISTS pulse_bpm SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vitals_entries_pulse_bpm_check'
  ) THEN
    ALTER TABLE vitals_entries
    ADD CONSTRAINT vitals_entries_pulse_bpm_check
    CHECK (pulse_bpm IS NULL OR pulse_bpm BETWEEN 25 AND 250);
  END IF;
END $$;
