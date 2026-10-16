-- Daily steps goal, stored alongside the other exercise targets.
ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS target_steps integer;
ALTER TABLE public.goal_presets ADD COLUMN IF NOT EXISTS target_steps integer;
