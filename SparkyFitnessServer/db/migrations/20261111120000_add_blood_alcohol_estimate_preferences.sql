-- Estimated blood alcohol curve (#3512): how the estimate is worked out and
-- shown. The estimate itself is never stored; it is derived from the logged
-- drinks (food_entries.alcohol_g) each time it is read.
--
-- bac_distribution_formula picks how Widmark's r comes from the profile
-- (sex, weight, height, age). Watson is the default because it uses all of
-- them; the plain Widmark constants ignore height and body build.
--
-- bac_elimination_rate is per mille per hour. 0.15 is the commonly used
-- average; the 0.10-0.25 range covers the published adult spread, and values
-- outside it are data entry errors.
--
-- bac_display_unit is display only: per mille (EU) or percent (US). The
-- server always works in per mille.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS bac_distribution_formula text NOT NULL DEFAULT 'watson',
  ADD COLUMN IF NOT EXISTS bac_elimination_rate numeric(4,3) NOT NULL DEFAULT 0.150,
  ADD COLUMN IF NOT EXISTS bac_display_unit text NOT NULL DEFAULT 'permille';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_bac_distribution_formula_check'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_bac_distribution_formula_check
      CHECK (bac_distribution_formula IN ('widmark', 'watson', 'seidl', 'forrest'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_bac_elimination_rate_range'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_bac_elimination_rate_range
      CHECK (bac_elimination_rate >= 0.1 AND bac_elimination_rate <= 0.25);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_bac_display_unit_check'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_bac_display_unit_check
      CHECK (bac_display_unit IN ('permille', 'percent'));
  END IF;
END $$;

COMMENT ON COLUMN public.user_preferences.bac_distribution_formula IS
  'How the estimated blood alcohol curve works out Widmark''s r from the profile: widmark, watson (default), seidl or forrest.';
COMMENT ON COLUMN public.user_preferences.bac_elimination_rate IS
  'Alcohol elimination for the estimated blood alcohol curve, per mille per hour, 0.10-0.25, default 0.15. Population estimate, not a measurement.';
COMMENT ON COLUMN public.user_preferences.bac_display_unit IS
  'Unit the estimated blood alcohol is shown in: permille (default) or percent. Display only; the server works in per mille.';
