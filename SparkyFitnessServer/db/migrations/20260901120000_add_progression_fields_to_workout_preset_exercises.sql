-- Add progression configuration, mode, and equipment metadata to workout_preset_exercises
ALTER TABLE workout_preset_exercises
  ADD COLUMN IF NOT EXISTS progression_mode varchar(30) DEFAULT 'rep_goal',
  ADD COLUMN IF NOT EXISTS rep_goal integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS increment_type varchar(20) DEFAULT 'weight',
  ADD COLUMN IF NOT EXISTS increment_value numeric(6, 2) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS equipment_brand varchar(100) DEFAULT NULL;