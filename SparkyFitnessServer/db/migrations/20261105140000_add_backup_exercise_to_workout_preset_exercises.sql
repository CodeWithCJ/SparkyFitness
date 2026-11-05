-- A backup exercise per preset slot ("machine taken"): one tap in a live
-- workout swaps it in and keeps the slot's sets and reps. Deleting the backup
-- exercise just clears the link.
ALTER TABLE public.workout_preset_exercises
  ADD COLUMN IF NOT EXISTS backup_exercise_id UUID
  REFERENCES public.exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_preset_exercises_backup_exercise_idx
  ON public.workout_preset_exercises (backup_exercise_id)
  WHERE backup_exercise_id IS NOT NULL;

COMMENT ON COLUMN public.workout_preset_exercises.backup_exercise_id IS
  'Exercise to swap in when the planned one is unavailable; keeps the sets.';
