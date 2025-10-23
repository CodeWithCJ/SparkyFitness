-- Migration to add the is_quick_exercise flag to the exercises table.
-- Adds a boolean column to mark exercises as 'quick' (hidden from normal search results)

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS is_quick_exercise BOOLEAN DEFAULT FALSE;

-- Optionally create an index for quick filtering
CREATE INDEX IF NOT EXISTS idx_exercises_is_quick_exercise ON exercises (is_quick_exercise);
