-- Workout preset sets gain a per-set distance column (km), mirroring the
-- exercise_entry_sets column from 20260727100000: cardio programmed into a
-- preset carries duration (seconds) + distance, so a live start and the
-- update-preset-on-finish flow can round-trip both.
-- Nullable, only meaningful on duration_distance sets. No backfill.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workout_preset_exercise_sets'
        AND column_name = 'distance'
    ) THEN
        ALTER TABLE workout_preset_exercise_sets ADD COLUMN distance numeric;
    END IF;
END $$;
