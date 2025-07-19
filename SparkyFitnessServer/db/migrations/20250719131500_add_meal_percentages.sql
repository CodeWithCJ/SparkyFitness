-- Add meal percentage columns to user_goals table
ALTER TABLE public.user_goals
ADD COLUMN breakfast_percentage NUMERIC,
ADD COLUMN lunch_percentage NUMERIC,
ADD COLUMN dinner_percentage NUMERIC,
ADD COLUMN snacks_percentage NUMERIC;

-- Add a check constraint to ensure the sum of meal percentages is 100
ALTER TABLE public.user_goals
ADD CONSTRAINT chk_meal_percentages_sum
CHECK (
    (breakfast_percentage IS NULL AND lunch_percentage IS NULL AND dinner_percentage IS NULL AND snacks_percentage IS NULL) OR
    (breakfast_percentage + lunch_percentage + dinner_percentage + snacks_percentage = 100)
);

-- Add meal percentage columns to goal_presets table
ALTER TABLE public.goal_presets
ADD COLUMN breakfast_percentage NUMERIC,
ADD COLUMN lunch_percentage NUMERIC,
ADD COLUMN dinner_percentage NUMERIC,
ADD COLUMN snacks_percentage NUMERIC;

-- Add a check constraint to ensure the sum of meal percentages is 100
ALTER TABLE public.goal_presets
ADD CONSTRAINT chk_meal_percentages_sum
CHECK (
    (breakfast_percentage IS NULL AND lunch_percentage IS NULL AND dinner_percentage IS NULL AND snacks_percentage IS NULL) OR
    (breakfast_percentage + lunch_percentage + dinner_percentage + snacks_percentage = 100)
);