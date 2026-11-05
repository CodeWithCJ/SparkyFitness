-- Double and triple progression work over a per-set rep range: reps climb
-- from rep_range_min up to rep_goal, then load (triple: a set first) goes up
-- and reps drop back to rep_range_min. progression_mode is varchar(30) with no
-- check constraint, so the new 'double' and 'triple' values need no change.
ALTER TABLE public.workout_preset_exercises
  ADD COLUMN IF NOT EXISTS rep_range_min integer DEFAULT NULL;

COMMENT ON COLUMN public.workout_preset_exercises.rep_range_min IS
  'Bottom of the per-set rep range for double/triple progression; rep_goal is the top. Null for other modes.';
