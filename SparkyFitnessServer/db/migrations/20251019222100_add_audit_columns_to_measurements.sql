-- Add created_by_user_id and updated_by_user_id to check_in_measurements
ALTER TABLE public.check_in_measurements
ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Add created_by_user_id and updated_by_user_id to custom_measurements
ALTER TABLE public.custom_measurements
ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Add created_by_user_id and updated_by_user_id to water_intake
ALTER TABLE public.water_intake
ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Add created_by_user_id and updated_by_user_id to custom_categories
ALTER TABLE public.custom_categories
ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

-- These columns are assumed to be added in previous migrations or already exist.
-- Removing to prevent "column already exists" error.
ALTER TABLE public.food_entries
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

ALTER TABLE public.exercise_entries
ADD COLUMN updated_by_user_id UUID REFERENCES auth.users(id) DEFAULT NULL;