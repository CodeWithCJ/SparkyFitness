-- Add has_detailed_stages column to sleep_entries
-- This distinguishes between entries with real sleepLevels data (detailed timing)
-- and entries with only summary data (synthetic stages from duration totals)

ALTER TABLE sleep_entries
ADD COLUMN IF NOT EXISTS has_detailed_stages BOOLEAN DEFAULT TRUE;

-- Set existing entries to have detailed stages (assume historical data is detailed)
-- New synthetic data will explicitly set this to false
COMMENT ON COLUMN sleep_entries.has_detailed_stages IS 'True if entry has detailed stage timing from Garmin sleepLevels API, false if stages are synthesized from summary durations';
