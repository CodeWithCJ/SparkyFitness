-- Migration to add goal mode and deficit settings to user preferences
ALTER TABLE public.user_preferences
  ADD COLUMN goal_mode VARCHAR(50) NOT NULL DEFAULT 'maintain',
  ADD COLUMN goal_mode_calculation_method VARCHAR(50) NOT NULL DEFAULT 'manual',
  ADD COLUMN goal_mode_custom_percentage INTEGER NOT NULL DEFAULT 0;
