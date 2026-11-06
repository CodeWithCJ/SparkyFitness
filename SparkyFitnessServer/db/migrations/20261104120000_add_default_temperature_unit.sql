-- Migration: Add default_temperature_unit to user_preferences
-- Description: Lets people pick °C or °F for temperatures (sleep skin temperature,
-- workout weather). Until now the apps showed °F with the miles distance setting,
-- so existing rows are filled from that once, when the column is added; after that
-- the two settings are independent and new accounts start on Celsius.
-- Date: 2026-11-04

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'default_temperature_unit'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD COLUMN default_temperature_unit TEXT NOT NULL DEFAULT 'celsius';

    -- Only on the run that adds the column, so a re-run never overwrites a choice.
    UPDATE public.user_preferences
      SET default_temperature_unit = 'fahrenheit'
      WHERE default_distance_unit = 'miles';
  END IF;
END $$;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_default_temperature_unit_check;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_default_temperature_unit_check
    CHECK (default_temperature_unit IN ('celsius', 'fahrenheit'));

COMMENT ON COLUMN public.user_preferences.default_temperature_unit IS
  'Unit temperatures are shown in: celsius or fahrenheit. Stored temperatures stay in °C.';
