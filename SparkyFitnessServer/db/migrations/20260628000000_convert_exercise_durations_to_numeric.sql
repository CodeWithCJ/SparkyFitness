-- Allow fractional (decimal) durations for exercise entries, sets, and workout
-- templates. Durations are stored in minutes and users need values such as
-- 2.5 minutes. The set duration columns were created as integer, and some
-- existing databases predate exercise_entries.duration_minutes being numeric,
-- so widen them all to numeric. Converting integer -> numeric is lossless, and
-- the ALTER is a no-op where the column is already numeric.

ALTER TABLE exercise_entries
  ALTER COLUMN duration_minutes TYPE numeric;

ALTER TABLE exercise_entry_sets
  ALTER COLUMN duration TYPE numeric;

ALTER TABLE workout_preset_exercise_sets
  ALTER COLUMN duration TYPE numeric;

ALTER TABLE workout_plan_assignment_sets
  ALTER COLUMN duration TYPE numeric;
