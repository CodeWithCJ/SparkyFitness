ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS adjust_macros_with_exercise BOOLEAN NOT NULL DEFAULT FALSE;
