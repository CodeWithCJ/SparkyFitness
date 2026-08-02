-- Seconds-based workout sets (issue #1903), in three guarded steps:
--   1. Per-set duration becomes integer SECONDS (was numeric de facto minutes).
--   2. Exercises and entries gain a modality column selecting the set editor.
--   3. exercise_entry_sets gains a per-set distance column (km) for cardio.
-- Each block is idempotent, so a re-run (or a database that already applied
-- an earlier split of these steps) is a no-op.

-- Step 1: per-set exercise duration is integer SECONDS. Historically web
-- wrote fractional minutes into these numeric columns while mobile/chatbot
-- wrote seconds; minutes was the de facto unit, so existing values are scaled.
-- Guarded on data_type so a re-run cannot multiply by 60 twice.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exercise_entry_sets'
        AND column_name = 'duration' AND data_type = 'numeric'
    ) THEN
        -- The x60 rewrite is irreversible and some historical rows were
        -- seconds-authored (chatbot, mobile timed sets). Capture pre-migration
        -- values so suspicious rows can be repaired afterwards.
        CREATE TABLE IF NOT EXISTS system.set_duration_premigration_backup (
            table_name text NOT NULL,
            set_id integer NOT NULL,
            duration_old numeric NOT NULL,
            PRIMARY KEY (table_name, set_id)
        );
        INSERT INTO system.set_duration_premigration_backup (table_name, set_id, duration_old)
        SELECT 'exercise_entry_sets', id, duration FROM exercise_entry_sets WHERE duration IS NOT NULL
        UNION ALL
        SELECT 'workout_plan_assignment_sets', id, duration FROM workout_plan_assignment_sets WHERE duration IS NOT NULL
        UNION ALL
        SELECT 'workout_preset_exercise_sets', id, duration FROM workout_preset_exercise_sets WHERE duration IS NOT NULL;

        ALTER TABLE exercise_entry_sets
        ALTER COLUMN duration TYPE integer USING ROUND(duration * 60)::integer;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workout_plan_assignment_sets'
        AND column_name = 'duration' AND data_type = 'numeric'
    ) THEN
        ALTER TABLE workout_plan_assignment_sets
        ALTER COLUMN duration TYPE integer USING ROUND(duration * 60)::integer;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workout_preset_exercise_sets'
        AND column_name = 'duration' AND data_type = 'numeric'
    ) THEN
        ALTER TABLE workout_preset_exercise_sets
        ALTER COLUMN duration TYPE integer USING ROUND(duration * 60)::integer;
    END IF;
END $$;

-- Step 2: exercise modality selects which set editor clients render:
-- weight_reps | reps_only | duration | duration_distance.
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

-- Step 3: per-set distance in km. Cardio logged as sets carries duration
-- (seconds) + distance on the set; reps/weight stay null.
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
