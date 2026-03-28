-- Migration: Add data source preferences to user_preferences
-- Users can now select a preferred data source per category (sleep, body, activity).
-- Default 'auto' means the existing score-based best-source selection is used.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS sleep_source_preference VARCHAR(50) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS body_source_preference  VARCHAR(50) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS activity_source_preference VARCHAR(50) NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN public.user_preferences.sleep_source_preference IS
  'Preferred source for sleep analytics: auto | garmin | withings | fitbit | polar | healthkit | health_connect | manual';

COMMENT ON COLUMN public.user_preferences.body_source_preference IS
  'Preferred source for body & weight data: auto | withings | garmin | fitbit | healthkit | health_connect | manual';

COMMENT ON COLUMN public.user_preferences.activity_source_preference IS
  'Preferred source for daily activity (steps, distance, calories): auto | garmin | fitbit | polar | healthkit | health_connect | manual';
