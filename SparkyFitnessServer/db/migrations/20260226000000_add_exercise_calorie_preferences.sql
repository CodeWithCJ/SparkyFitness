-- Add exercise calorie earn-back and TDEE adjustment options to user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS exercise_calorie_percentage INTEGER DEFAULT 100;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS activity_level VARCHAR(20) DEFAULT 'not_much';

-- Allow negative TDEE adjustments (default: false = no penalty for burning less than TDEE)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tdee_allow_negative_adjustment BOOLEAN DEFAULT FALSE;
