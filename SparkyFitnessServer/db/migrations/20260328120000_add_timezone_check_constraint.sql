-- Migration: Make timezone nullable with NULL as "never explicitly set" sentinel
ALTER TABLE public.user_preferences
  ALTER COLUMN timezone DROP NOT NULL,
  ALTER COLUMN timezone SET DEFAULT NULL;

UPDATE public.user_preferences SET timezone = NULL;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_timezone_not_empty
  CHECK (timezone IS NULL OR timezone <> '');
