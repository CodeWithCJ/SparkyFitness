-- Migration: Opt-in push of daily nutrition totals to Intervals.icu.
-- File: SparkyFitnessServer/db/migrations/20261024130000_add_intervals_nutrition_push.sql
--
-- user_preferences.intervals_push_nutrition is the opt-in (off by default).
-- intervals_nutrition_pushes holds the four values last accepted by Intervals
-- for each day, so a later push or a "remove pushed data" clears only fields
-- still holding what SparkyFitness wrote. Rows are kept on disconnect.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS intervals_push_nutrition BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.intervals_nutrition_pushes (
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    kcal_consumed INTEGER,
    protein NUMERIC,
    carbohydrates NUMERIC,
    fat_total NUMERIC,
    pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, entry_date)
);
