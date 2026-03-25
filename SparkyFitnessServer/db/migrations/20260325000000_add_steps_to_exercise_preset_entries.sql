-- Migration: Add steps column to exercise_preset_entries table
-- The previous migration (20260323122741) only added steps to exercise_entries.
-- The exercise history service also queries steps from exercise_preset_entries.
ALTER TABLE public.exercise_preset_entries
ADD COLUMN IF NOT EXISTS steps integer;
COMMENT ON COLUMN public.exercise_preset_entries.steps IS 'Total number of steps recorded for this workout session, sourced from Garmin or other providers.';
