-- Add option to allow negative TDEE adjustments (default: false = no penalty for burning less than TDEE)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tdee_allow_negative_adjustment BOOLEAN DEFAULT FALSE;
