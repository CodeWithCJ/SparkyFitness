-- Heart rate zone settings: the person's own max and resting heart rate, how
-- their five zones are worked out, and custom zone floors. NULL max/resting
-- means "work it out" (from date of birth; see shared/src/utils/heartRateZones.ts).
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS max_heart_rate SMALLINT,
  ADD COLUMN IF NOT EXISTS resting_heart_rate SMALLINT,
  ADD COLUMN IF NOT EXISTS hr_zone_method TEXT NOT NULL DEFAULT 'percent_max',
  ADD COLUMN IF NOT EXISTS hr_zone_custom_floors SMALLINT[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_max_heart_rate_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_max_heart_rate_check
      CHECK (max_heart_rate IS NULL OR max_heart_rate BETWEEN 100 AND 250);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_resting_heart_rate_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_resting_heart_rate_check
      CHECK (resting_heart_rate IS NULL OR resting_heart_rate BETWEEN 25 AND 150);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_hr_zone_method_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_hr_zone_method_check
      CHECK (hr_zone_method IN ('percent_max', 'heart_rate_reserve', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_hr_zone_custom_floors_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_hr_zone_custom_floors_check
      CHECK (hr_zone_custom_floors IS NULL OR array_length(hr_zone_custom_floors, 1) = 5);
  END IF;
END $$;

COMMENT ON COLUMN public.user_preferences.max_heart_rate IS
  'Max heart rate the person set, in bpm. NULL derives it from date of birth.';
COMMENT ON COLUMN public.user_preferences.resting_heart_rate IS
  'Resting heart rate the person set, in bpm. Needed for the heart_rate_reserve method.';
COMMENT ON COLUMN public.user_preferences.hr_zone_method IS
  'How the five zone floors are worked out: percent_max, heart_rate_reserve (Karvonen) or custom.';
COMMENT ON COLUMN public.user_preferences.hr_zone_custom_floors IS
  'Five ascending bpm floors, zone 1 first, used when hr_zone_method is custom.';

-- Which method a stored time-in-zone breakdown was worked out with. Zones are
-- computed when a workout is stored and never rewritten when settings change,
-- so each row records its own method. NULL = stored before methods were recorded.
-- Which method a stored time-in-zone breakdown was worked out with. Zones are
-- computed when a workout is stored and never rewritten when settings change,
-- so each row records its own method. NULL = stored before methods were recorded.
ALTER TABLE public.exercise_entry_hr_zones
  ADD COLUMN IF NOT EXISTS zone_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercise_entry_hr_zones_zone_method_check') THEN
    ALTER TABLE public.exercise_entry_hr_zones
      ADD CONSTRAINT exercise_entry_hr_zones_zone_method_check
      CHECK (zone_method IS NULL OR zone_method IN ('percent_max', 'heart_rate_reserve', 'custom', 'device'));
  END IF;
END $$;

COMMENT ON COLUMN public.exercise_entry_hr_zones.zone_method IS
  'Method the zone bounds were computed with when stored; device = zones supplied by the recording device (Garmin, Apple).';
