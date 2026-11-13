
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS adaptive_activity_separate BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_preferences.adaptive_activity_separate IS
  'Opt-in for Dynamic + Adaptive: learn a baseline without recorded activity and credit daily activity separately.';

