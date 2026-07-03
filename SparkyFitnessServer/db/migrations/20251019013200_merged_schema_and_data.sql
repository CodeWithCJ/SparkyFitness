-- Consolidated Migration for Foundational Schema Enhancements and Data Backfill

-- 1.1. Enhance Family Access Permissions and add shared_with_public to meals
-- Truncate the existing family_access table to ensure a clean slate.
-- This will require users to re-establish their family sharing connections,
-- but guarantees that all new connections use the correct, new permission structure.
TRUNCATE TABLE public.family_access RESTART IDENTITY;

-- Drop the old default value for the access_permissions column, if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'family_access'
          AND column_name = 'access_permissions'
          AND column_default IS NOT NULL
    ) THEN
        ALTER TABLE public.family_access ALTER COLUMN access_permissions DROP DEFAULT;
    END IF;
END $$;

-- Set the new, comprehensive default value for the access_permissions column.
ALTER TABLE public.family_access
ALTER COLUMN access_permissions SET DEFAULT '{
    "can_manage_diary": false,
    "can_view_food_library": false,
    "can_view_exercise_library": false
}'::jsonb;

-- Ensure all existing records have the new keys and remove old ones.
UPDATE public.family_access
SET access_permissions = '{
    "can_manage_diary": false,
    "can_view_food_library": false,
    "can_view_exercise_library": false
}'::jsonb || (access_permissions - 'can_view_food_list' - 'can_view_exercise_list' - 'can_manage_check_in' - 'can_view_reports')
WHERE access_permissions IS NOT NULL;

-- Add the shared_with_public column to the meals table if it doesn't exist.
-- The foods and exercises tables already have this column.
ALTER TABLE public.meals
ADD COLUMN IF NOT EXISTS shared_with_public BOOLEAN DEFAULT FALSE;


-- 1.2. Add created_by_user_id column to food_entries and exercise_entries tables
ALTER TABLE public.food_entries
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.exercise_entries
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- 1.3. Add snapshot columns (including names) to the entry tables

-- Food Entries Snapshot Columns
ALTER TABLE public.food_entries
ADD COLUMN IF NOT EXISTS food_name TEXT,
ADD COLUMN IF NOT EXISTS brand_name TEXT,
ADD COLUMN IF NOT EXISTS serving_size NUMERIC,
ADD COLUMN IF NOT EXISTS serving_unit TEXT,
ADD COLUMN IF NOT EXISTS calories NUMERIC,
ADD COLUMN IF NOT EXISTS protein NUMERIC,
ADD COLUMN IF NOT EXISTS carbs NUMERIC,
ADD COLUMN IF NOT EXISTS fat NUMERIC,
ADD COLUMN IF NOT EXISTS saturated_fat NUMERIC,
ADD COLUMN IF NOT EXISTS polyunsaturated_fat NUMERIC,
ADD COLUMN IF NOT EXISTS monounsaturated_fat NUMERIC,
ADD COLUMN IF NOT EXISTS trans_fat NUMERIC,
ADD COLUMN IF NOT EXISTS cholesterol NUMERIC,
ADD COLUMN IF NOT EXISTS sodium NUMERIC,
ADD COLUMN IF NOT EXISTS potassium NUMERIC,
ADD COLUMN IF NOT EXISTS dietary_fiber NUMERIC,
ADD COLUMN IF NOT EXISTS sugars NUMERIC,
ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC,
ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC,
ADD COLUMN IF NOT EXISTS calcium NUMERIC,
ADD COLUMN IF NOT EXISTS iron NUMERIC,
ADD COLUMN IF NOT EXISTS glycemic_index TEXT;

-- Exercise Entries Snapshot Columns
ALTER TABLE public.exercise_entries
ADD COLUMN IF NOT EXISTS exercise_name TEXT,
ADD COLUMN IF NOT EXISTS calories_per_hour NUMERIC;


-- 1.4. Add updated_at timestamp to the food_variants and meal_foods tables
ALTER TABLE public.food_variants
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE public.meal_foods
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add triggers to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist to avoid conflicts during re-runs
DROP TRIGGER IF EXISTS update_food_variants_timestamp ON public.food_variants;
DROP TRIGGER IF EXISTS update_meal_foods_timestamp ON public.meal_foods;

CREATE TRIGGER update_food_variants_timestamp
BEFORE UPDATE ON public.food_variants
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_meal_foods_timestamp
BEFORE UPDATE ON public.meal_foods
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();


-- 1.5. Create the user_ignored_updates table
CREATE TABLE IF NOT EXISTS public.user_ignored_updates (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL, -- Can be food_variant_id or exercise_id (for exercise variants)
    ignored_at_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (user_id, variant_id)
);

-- Add an index for faster lookups by variant_id
CREATE INDEX IF NOT EXISTS idx_user_ignored_updates_variant_id ON public.user_ignored_updates (variant_id);

-- Backfill food_entries with data from food_variants and foods
UPDATE food_entries fe
SET
    food_name = f.name,
    brand_name = f.brand,
    serving_size = fv.serving_size,
    serving_unit = fv.serving_unit,
    calories = fv.calories,
    protein = fv.protein,
    carbs = fv.carbs,
    fat = fv.fat,
    saturated_fat = fv.saturated_fat,
    polyunsaturated_fat = fv.polyunsaturated_fat,
    monounsaturated_fat = fv.monounsaturated_fat,
    trans_fat = fv.trans_fat,
    cholesterol = fv.cholesterol,
    sodium = fv.sodium,
    potassium = fv.potassium,
    dietary_fiber = fv.dietary_fiber,
    sugars = fv.sugars,
    vitamin_a = fv.vitamin_a,
    vitamin_c = fv.vitamin_c,
    calcium = fv.calcium,
    iron = fv.iron
FROM food_variants fv
JOIN foods f ON fv.food_id = f.id
WHERE fe.variant_id = fv.id;

-- Backfill exercise_entries with data from exercises
UPDATE exercise_entries ee
SET
    exercise_name = e.name,
    calories_per_hour = e.calories_per_hour
FROM exercises e
WHERE ee.exercise_id = e.id;