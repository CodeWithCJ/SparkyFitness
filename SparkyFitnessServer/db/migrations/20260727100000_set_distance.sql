-- Per-set distance in km (issue #1903): cardio logged as sets carries
-- duration (seconds) + distance on the set; reps/weight stay null.
-- Nullable, only meaningful on duration_distance sets. No backfill.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exercise_entry_sets'
        AND column_name = 'distance'
    ) THEN
        ALTER TABLE exercise_entry_sets ADD COLUMN distance numeric;
    END IF;
END $$;
