ALTER TABLE public.food_entries ADD COLUMN IF NOT EXISTS entry_time time;
COMMENT ON COLUMN public.food_entries.entry_time IS
  'Optional wall-clock local time of day the food was eaten (no timezone). NULL = not recorded.';

ALTER TABLE public.food_entry_meals ADD COLUMN IF NOT EXISTS entry_time time;
COMMENT ON COLUMN public.food_entry_meals.entry_time IS
  'Optional wall-clock local time of day the logged meal was eaten (no timezone). NULL = not recorded.';

ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS entry_time time;
COMMENT ON COLUMN public.exercise_entries.entry_time IS
  'Optional wall-clock local start time of the exercise session (no timezone). NULL = not recorded.';

ALTER TABLE public.meal_types ADD COLUMN IF NOT EXISTS default_time time;
COMMENT ON COLUMN public.meal_types.default_time IS
  'Base default time of day for this meal slot, used to prefill diary entry times. For system meal types this is a global base; per-user values live in user_meal_visibilities.default_time.';

ALTER TABLE public.user_meal_visibilities ADD COLUMN IF NOT EXISTS default_time time;
COMMENT ON COLUMN public.user_meal_visibilities.default_time IS
  'Per-user override of meal_types.default_time (same pattern as is_visible/show_in_quick_log).';
