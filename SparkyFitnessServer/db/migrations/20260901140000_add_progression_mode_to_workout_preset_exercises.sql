ALTER TABLE workout_preset_exercises
  ADD COLUMN IF NOT EXISTS progression_mode varchar(30) DEFAULT 'rep_goal';