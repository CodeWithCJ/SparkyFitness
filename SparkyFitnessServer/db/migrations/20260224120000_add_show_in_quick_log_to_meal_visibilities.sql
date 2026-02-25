-- Add show_in_quick_log column to user_meal_visibilities
-- This allows users to select which meal types appear in the "Food Log" quick action

ALTER TABLE public.user_meal_visibilities 
ADD COLUMN IF NOT EXISTS show_in_quick_log boolean DEFAULT true;

-- Also add to meal_types as a default value for new users
ALTER TABLE public.meal_types 
ADD COLUMN IF NOT EXISTS show_in_quick_log boolean DEFAULT true;

-- Set default values for existing default meal type
-- These should show in quick log
UPDATE public.meal_types 
SET show_in_quick_log = true 
WHERE user_id IS NULL;
