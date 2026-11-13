-- Weekly weight change is opt-in. Existing percentage goals keep their mode.
ALTER TABLE public.user_preferences
  ADD COLUMN goal_mode_weekly_change_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD CONSTRAINT user_preferences_weekly_weight_goal_range CHECK (
    goal_mode_weekly_change_kg BETWEEN -2 AND 2
    AND ABS(goal_mode_weekly_change_kg * 1000 - ROUND(goal_mode_weekly_change_kg * 1000)) < 0.000001
  );

COMMENT ON COLUMN public.user_preferences.goal_mode_weekly_change_kg IS
  'Signed kilograms per week for goal_mode=weekly: negative loses, positive gains, zero maintains. Stored to gram precision; does not change existing percentage goals.';
