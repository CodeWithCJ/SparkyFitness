-- How many heart rate bands the person sees: 5 zones, or 4 tiers (Light is
-- zones 1 and 2, then Moderate, Vigorous and Peak). Display only: zones are
-- always worked out and stored as five.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS hr_zone_display_count SMALLINT NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_hr_zone_display_count_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_hr_zone_display_count_check
      CHECK (hr_zone_display_count IN (4, 5));
  END IF;
END $$;

COMMENT ON COLUMN public.user_preferences.hr_zone_display_count IS
  'Heart rate bands shown in reports and settings: 5 zones or 4 tiers (zones 1-2 merged as Light). Storage and training load always use five zones.';
