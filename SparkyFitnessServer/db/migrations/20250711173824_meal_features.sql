SET search_path = public, auth;

-- Add PRIMARY KEY constraint to the foods table (from original 20250711173824_meal_features.sql)
ALTER TABLE public.foods
ADD CONSTRAINT foods_pkey PRIMARY KEY (id);

-- Create meals table (from original 20250711173824_meal_features.sql)
CREATE TABLE public.meals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meals_pkey PRIMARY KEY (id)
);

-- Create meal_foods table (from original 20250711173824_meal_features.sql)
CREATE TABLE public.meal_foods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL,
  food_id uuid NOT NULL,
  variant_id uuid,
  quantity NUMERIC NOT NULL,
  unit VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meal_foods_pkey PRIMARY KEY (id)
);

-- Create meal_plans table (from original 20250711173824_meal_features.sql)
CREATE TABLE public.meal_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meal_id uuid,
  food_id uuid,
  variant_id uuid,
  quantity NUMERIC,
  unit VARCHAR(50),
  plan_date DATE NOT NULL,
  meal_type VARCHAR(50) NOT NULL,
  is_template BOOLEAN DEFAULT FALSE,
  template_name VARCHAR(255),
  day_of_week INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meal_plans_pkey PRIMARY KEY (id),
  CONSTRAINT chk_meal_or_food CHECK (
    (meal_id IS NOT NULL AND food_id IS NULL AND variant_id IS NULL AND quantity IS NULL AND unit IS NULL) OR
    (meal_id IS NULL AND food_id IS NOT NULL AND variant_id IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL)
  )
);

-- Refactor meal_plan_templates (from 20250711215400_refactor_meal_plan_templates.sql)
-- Drop old tables if they exist from previous attempts (important for clean re-runs)
DROP TABLE IF EXISTS public.meal_plan_template_assignments CASCADE;
DROP TABLE IF EXISTS public.meal_day_presets CASCADE;
DROP TABLE IF EXISTS public.meal_plan_templates CASCADE;

-- Create the new, cleaner meal_plan_templates table
CREATE TABLE public.meal_plan_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT meal_plan_templates_pkey PRIMARY KEY (id),
    CONSTRAINT meal_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Create the meal_plan_template_assignments table (from 20250711215400_refactor_meal_plan_templates.sql)
CREATE TABLE public.meal_plan_template_assignments (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0 for Sunday, 1 for Monday, etc.
    meal_type VARCHAR(50) NOT NULL, -- 'breakfast', 'lunch', 'dinner', 'snacks'
    meal_id UUID, -- Made nullable here due to later migration
    CONSTRAINT meal_plan_template_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT meal_plan_template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.meal_plan_templates (id) ON DELETE CASCADE,
    CONSTRAINT meal_plan_template_assignments_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE
);

-- Add columns to meal_plan_template_assignments (from 20250712154550_add_food_to_meal_plan_assignments.sql)
ALTER TABLE meal_plan_template_assignments
ADD COLUMN item_type VARCHAR(50) NOT NULL DEFAULT 'meal',
ADD COLUMN food_id UUID,
ADD COLUMN variant_id UUID,
ADD COLUMN quantity NUMERIC(10, 2),
ADD COLUMN unit VARCHAR(50);

-- Add foreign key constraints for food and food_variant to meal_plan_template_assignments
ALTER TABLE meal_plan_template_assignments
ADD CONSTRAINT fk_food
FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE;

ALTER TABLE meal_plan_template_assignments
ADD CONSTRAINT fk_food_variant
FOREIGN KEY (variant_id) REFERENCES food_variants(id) ON DELETE CASCADE;

-- Add meal_plan_template_id to food_entries table and fix foreign key (consolidated)
ALTER TABLE public.food_entries
ADD COLUMN meal_plan_template_id uuid;

ALTER TABLE public.food_entries
ADD CONSTRAINT food_entries_meal_plan_template_id_fkey
FOREIGN KEY (meal_plan_template_id) REFERENCES public.meal_plan_templates (id) ON DELETE SET NULL;

-- Add a unique constraint to ensure only one plan is active for a user at any given time. (from 20250711215400_refactor_meal_plan_templates.sql)
CREATE UNIQUE INDEX one_active_meal_plan_per_user
ON public.meal_plan_templates (user_id)
WHERE is_active = TRUE;

-- Add/Update check constraint for meal_plan_template_assignments (from 20250712155253_alter_meal_id_nullable_in_meal_plan_assignments.sql)
ALTER TABLE meal_plan_template_assignments
DROP CONSTRAINT IF EXISTS chk_item_type_and_id;

ALTER TABLE meal_plan_template_assignments
ADD CONSTRAINT chk_item_type_and_id
CHECK (
    (item_type = 'meal' AND meal_id IS NOT NULL AND food_id IS NULL) OR
    (item_type = 'food' AND food_id IS NOT NULL AND meal_id IS NULL)
);

-- Add foreign key constraints after all tables are created (from original 20250711173824_meal_features.sql)
ALTER TABLE public.meals
ADD CONSTRAINT meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.meals VALIDATE CONSTRAINT meals_user_id_fkey;

ALTER TABLE public.meal_foods
ADD CONSTRAINT meal_foods_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE NOT VALID,
ADD CONSTRAINT meal_foods_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods (id) ON DELETE CASCADE NOT VALID,
ADD CONSTRAINT meal_foods_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.meal_foods VALIDATE CONSTRAINT meal_foods_meal_id_fkey;
ALTER TABLE public.meal_foods VALIDATE CONSTRAINT meal_foods_food_id_fkey;
ALTER TABLE public.meal_foods VALIDATE CONSTRAINT meal_foods_variant_id_fkey;

ALTER TABLE public.meal_plans
ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID,
ADD CONSTRAINT meal_plans_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE NOT VALID,
ADD CONSTRAINT meal_plans_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods (id) ON DELETE CASCADE NOT VALID,
ADD CONSTRAINT meal_plans_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.meal_plans VALIDATE CONSTRAINT meal_plans_user_id_fkey;
ALTER TABLE public.meal_plans VALIDATE CONSTRAINT meal_plans_meal_id_fkey;
ALTER TABLE public.meal_plans VALIDATE CONSTRAINT meal_plans_food_id_fkey;
ALTER TABLE public.meal_plans VALIDATE CONSTRAINT meal_plans_variant_id_fkey;
