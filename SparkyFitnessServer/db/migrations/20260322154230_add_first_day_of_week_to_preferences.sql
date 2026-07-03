-- Migration: Add first_day_of_week column to user_preferences table
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS first_day_of_week smallint DEFAULT 0;

COMMENT ON COLUMN public.user_preferences.first_day_of_week IS 'Start day of the week: 0 for Sunday (USA standard), 1 for Monday (ISO 8601).';