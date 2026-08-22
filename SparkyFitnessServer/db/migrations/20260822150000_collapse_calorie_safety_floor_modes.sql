-- Collapse the calorie safety floor to two formula-derived modes.
--
-- `standard` keeps the historical floor, max(RMR, clinical minimum). The escape
-- hatch is now `clinical_minimum`, which drops only the RMR half. The RMR half is
-- what makes deeper goal modes unreachable at low activity levels (the bound is
-- 1 - 1/activityMultiplier, ~17% for a sedentary user), and it is the half without
-- clinical backing. The clinical minimum itself is not opt-out.
--
-- Existing rows: `custom` and `disabled` both map to `clinical_minimum`, the closest
-- surviving behaviour. A stored custom value is dropped along with the column, since
-- a static number does not track weight change the way the formula does.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_calorie_safety_floor_mode_check;

UPDATE public.user_preferences
  SET calorie_safety_floor_mode = 'clinical_minimum'
  WHERE calorie_safety_floor_mode IN ('custom', 'disabled');

ALTER TABLE public.user_preferences
  DROP COLUMN IF EXISTS calorie_safety_floor_value,
  ADD CONSTRAINT user_preferences_calorie_safety_floor_mode_check
    CHECK (calorie_safety_floor_mode IN ('standard', 'clinical_minimum'));

COMMENT ON COLUMN public.user_preferences.calorie_safety_floor_mode IS
  'Adaptive calorie target clamping: standard = max(RMR, clinical minimum); clinical_minimum = clinical minimum only.';
