-- Migration: Allow multiple active meal plan templates per user
-- Drops the unique constraint index restricting users to only 1 active meal plan at a time.

DROP INDEX IF EXISTS public.one_active_meal_plan_per_user;
