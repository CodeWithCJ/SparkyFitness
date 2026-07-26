-- Per-set exercise duration is integer SECONDS (issue #1903). Historically web
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
