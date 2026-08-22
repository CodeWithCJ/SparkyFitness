ALTER TABLE public.user_preferences
  ADD COLUMN calorie_safety_floor_mode TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN calorie_safety_floor_value INTEGER NOT NULL DEFAULT 1200,
  ADD CONSTRAINT user_preferences_calorie_safety_floor_mode_check
    CHECK (calorie_safety_floor_mode IN ('standard', 'custom', 'disabled')),
  ADD CONSTRAINT user_preferences_calorie_safety_floor_value_check
    CHECK (calorie_safety_floor_value BETWEEN 800 AND 5000);

COMMENT ON COLUMN public.user_preferences.calorie_safety_floor_mode IS
  'Controls adaptive calorie target clamping: standard, custom, or disabled.';
COMMENT ON COLUMN public.user_preferences.calorie_safety_floor_value IS
  'Custom calorie safety floor in kcal when calorie_safety_floor_mode is custom.';
