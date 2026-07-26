-- Exercise modality selects which set editor clients render (issue #1903
-- stage 2): weight_reps | reps_only | duration | duration_distance.
-- Derivation rules must match deriveExerciseModality in @workspace/shared.
-- Guarded on column existence so the backfill cannot re-run.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exercises'
        AND column_name = 'modality'
    ) THEN
        ALTER TABLE exercises ADD COLUMN modality text;
        UPDATE exercises SET modality = CASE
            WHEN lower(btrim(category)) = 'cardio' THEN 'duration_distance'
            WHEN lower(btrim(category)) IN ('isometric', 'isometrics') THEN 'duration'
            ELSE 'weight_reps'
        END;
        ALTER TABLE exercises ALTER COLUMN modality SET DEFAULT 'weight_reps';
        ALTER TABLE exercises ALTER COLUMN modality SET NOT NULL;
        ALTER TABLE exercises ADD CONSTRAINT exercises_modality_check
            CHECK (modality IN ('weight_reps', 'reps_only', 'duration', 'duration_distance'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exercise_entries'
        AND column_name = 'modality'
    ) THEN
        ALTER TABLE exercise_entries ADD COLUMN modality text;
        UPDATE exercise_entries SET modality = CASE
            WHEN lower(btrim(category)) = 'cardio' THEN 'duration_distance'
            WHEN lower(btrim(category)) IN ('isometric', 'isometrics') THEN 'duration'
            ELSE 'weight_reps'
        END;
        ALTER TABLE exercise_entries ADD CONSTRAINT exercise_entries_modality_check
            CHECK (modality IN ('weight_reps', 'reps_only', 'duration', 'duration_distance'));
    END IF;
END $$;
