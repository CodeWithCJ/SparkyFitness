-- Add activity_level to user_preferences for TDEE-based calorie adjustment mode
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS activity_level VARCHAR(20) DEFAULT 'not_much';
