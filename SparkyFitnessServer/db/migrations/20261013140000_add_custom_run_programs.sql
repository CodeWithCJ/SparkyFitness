-- Migration: A person's own run programs (a free list of workouts they build),
-- kept apart from the one they are running. Starting one copies it into
-- run_programs (program_id 'custom:<id>'), which now also remembers the name
-- and activity of such a program, since there is no built-in definition to
-- look them up in.
-- Date: 2026-10-13

CREATE TABLE IF NOT EXISTS public.custom_run_programs (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    activity VARCHAR(10) NOT NULL DEFAULT 'run'
        CHECK (activity IN ('run', 'walk')),
    workouts JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_run_programs_user
    ON public.custom_run_programs (user_id);

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS name VARCHAR(60),
    ADD COLUMN IF NOT EXISTS activity VARCHAR(10)
        CHECK (activity IS NULL OR activity IN ('run', 'walk'));
