-- Migration: Create run_goals, a person's running goals (one row per user): a
-- weekly running distance target and a race (name, day and distance) to count
-- down to. Both are optional and independent of the run program.
-- Date: 2026-10-15

CREATE TABLE IF NOT EXISTS public.run_goals (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    -- Kilometres to run in a week (weeks start on the account's first day of
    -- the week), or NULL for no target. Distances are stored metric.
    weekly_distance_km NUMERIC(6, 1)
        CHECK (weekly_distance_km IS NULL OR (weekly_distance_km > 0 AND weekly_distance_km <= 1000)),
    race_name VARCHAR(100),
    race_date DATE,
    -- Race distance in kilometres, for display only.
    race_distance_km NUMERIC(6, 2)
        CHECK (race_distance_km IS NULL OR (race_distance_km > 0 AND race_distance_km <= 1000)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_run_goals_user UNIQUE (user_id),
    -- A race name or distance means nothing without the day.
    CONSTRAINT chk_run_goals_race_has_date
        CHECK (race_date IS NOT NULL OR (race_name IS NULL AND race_distance_km IS NULL))
);
