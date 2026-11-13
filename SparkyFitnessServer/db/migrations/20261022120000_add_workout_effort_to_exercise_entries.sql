-- How hard the person rated a workout, 1 (easy) to 10 (maximal). Read from
-- Apple's workout effort score or entered after a watch workout. A strength
-- session stores the same rating on each of its exercise entries.
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS workout_effort smallint;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS chk_exercise_entries_workout_effort;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT chk_exercise_entries_workout_effort
  CHECK (workout_effort IS NULL OR workout_effort BETWEEN 1 AND 10);
