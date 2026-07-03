-- Migration: Add steps column to exercise_entries and exercise_preset_entries table
ALTER TABLE public.exercise_entries
ADD COLUMN IF NOT EXISTS steps integer;
COMMENT ON COLUMN public.exercise_entries.steps IS 'Number of steps recorded during this activity, sourced from Garmin or other providers.';
