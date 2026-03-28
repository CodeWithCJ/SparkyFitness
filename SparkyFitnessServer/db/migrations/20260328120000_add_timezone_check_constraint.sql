-- Migration: Normalize invalid timezones and add CHECK constraint
UPDATE public.user_preferences
SET timezone = 'UTC'
WHERE timezone NOT IN (SELECT name FROM pg_timezone_names);

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_timezone_not_empty CHECK (timezone <> '');
