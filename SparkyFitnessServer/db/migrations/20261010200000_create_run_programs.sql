-- Migration: Create run_programs, a person's multi-week run program and their
-- place in it (one row per user). `workouts` is the person's own copy of the
-- program's workouts, so the AI assistant can adjust upcoming ones.
-- Also holds the Diary schedule (run days, first day, goal day), the effort
-- ratings, and which diary entry each finished workout was done as.
-- Date: 2026-10-10

CREATE TABLE IF NOT EXISTS public.run_programs (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    program_id VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_index INTEGER NOT NULL DEFAULT 0 CHECK (next_index >= 0),
    workouts JSONB NOT NULL DEFAULT '[]'::jsonb,
    adjustment_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- How hard each finished workout felt (1 to 10), so the app and the
    -- assistant can suggest easing off or moving on.
    effort_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Which diary entry each finished workout was done as, so the activity can
    -- be shown as part of the program.
    completion_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Diary schedule, like a workout plan's: the weekdays the person plans to
    -- run (none means every day), the first day the workout is offered, the
    -- goal day (race day) the schedule stops at, and the last day a program
    -- workout was completed.
    run_days SMALLINT[] NOT NULL DEFAULT '{}'
        CHECK (run_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]),
    start_date DATE,
    end_date DATE,
    last_done_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_run_programs_user UNIQUE (user_id),
    -- The goal day cannot be before the first day, whichever request sets it.
    CONSTRAINT chk_run_programs_end_after_start
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
