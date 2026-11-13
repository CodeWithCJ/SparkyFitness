-- Calories an entry contributes to the daily calorie balance, and an optional
-- link between a workout logged in SparkyFitness and the same session synced
-- from a watch or health platform so those calories count once.
--
-- calories_applied NULL means the entry's own estimate (calories_burned)
-- counts, as before. A value (0 or more) replaces it. Both sides of a link
-- share calorie_link_id and calorie_link_resolution; calories_burned keeps
-- each side's own estimate.
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calories_applied numeric;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS chk_exercise_entries_calories_applied;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT chk_exercise_entries_calories_applied
  CHECK (calories_applied IS NULL OR calories_applied >= 0);

ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calorie_link_id uuid;
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calorie_link_resolution text;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS chk_exercise_entries_calorie_link_resolution;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT chk_exercise_entries_calorie_link_resolution
  CHECK (
    calorie_link_resolution IS NULL
    OR calorie_link_resolution IN ('sparkyfitness', 'synced', 'higher', 'lower', 'average', 'custom')
  );
CREATE INDEX IF NOT EXISTS idx_exercise_entries_calorie_link_id
  ON public.exercise_entries (calorie_link_id)
  WHERE calorie_link_id IS NOT NULL;
