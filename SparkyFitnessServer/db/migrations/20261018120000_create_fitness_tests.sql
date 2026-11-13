-- Migration: Create fitness_tests, a person's running fitness tests (a 5K time
-- trial, a 30-minute all-out run or a 12-minute Cooper test) and the training
-- paces each one gave. The server works the result and paces out from the
-- measurements, so every device agrees. `exercise_entry_id` marks the recorded
-- activity the test was run as; it survives only as long as the activity.
-- `surface` records where it was run (outdoors with GPS or indoors on a
-- treadmill) and, for a treadmill, the incline and whether the result was
-- corrected for it.
-- Date: 2026-10-18

CREATE TABLE IF NOT EXISTS public.fitness_tests (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    test_type VARCHAR(10) NOT NULL
        CHECK (test_type IN ('5k', '30min', 'cooper')),
    test_date DATE NOT NULL,
    exercise_entry_id UUID REFERENCES public.exercise_entries(id) ON DELETE SET NULL,
    -- 5K: 5000. 30-minute run: distance in 30 minutes. Cooper: distance in 12 minutes.
    distance_meters NUMERIC(9, 1) NOT NULL CHECK (distance_meters > 0),
    -- 5K: the time taken. 30-minute run: 1800. Cooper: 720.
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    -- 30-minute run only: distance after the first 10 minutes.
    split_distance_meters NUMERIC(9, 1) CHECK (split_distance_meters IS NULL OR split_distance_meters >= 0),
    -- Seconds (5K), seconds per km of the last 20 minutes (30-minute run) or metres (Cooper).
    result_value NUMERIC(9, 1) NOT NULL,
    threshold_pace_seconds_per_km INTEGER NOT NULL,
    equivalent_5k_seconds INTEGER NOT NULL,
    -- The derived pace zones and race-based ranges.
    paces JSONB NOT NULL DEFAULT '{}'::jsonb,
    surface VARCHAR(10) NOT NULL DEFAULT 'outdoor'
        CHECK (surface IN ('outdoor', 'indoor')),
    incline_percent NUMERIC(3, 1)
        CHECK (incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 15)),
    incline_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fitness_tests_user_date
    ON public.fitness_tests (user_id, test_date DESC, created_at DESC);

-- One test per recorded activity, so a retried save never files it twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fitness_tests_exercise_entry
    ON public.fitness_tests (exercise_entry_id)
    WHERE exercise_entry_id IS NOT NULL;

-- Databases that already ran the table without the treadmill columns.
ALTER TABLE public.fitness_tests
    ADD COLUMN IF NOT EXISTS surface VARCHAR(10) NOT NULL DEFAULT 'outdoor'
        CHECK (surface IN ('outdoor', 'indoor')),
    ADD COLUMN IF NOT EXISTS incline_percent NUMERIC(3, 1)
        CHECK (incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 15)),
    ADD COLUMN IF NOT EXISTS incline_adjusted BOOLEAN NOT NULL DEFAULT FALSE;
