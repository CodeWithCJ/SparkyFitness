-- Migration to add cascading deletes and clean up orphaned records

BEGIN;

-- Phase 1: Clean up existing orphaned records

-- Delete orphaned food entries
DELETE FROM public.food_entries
WHERE food_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.foods WHERE id = public.food_entries.food_id
);

-- Delete orphaned food variants
DELETE FROM public.food_variants
WHERE food_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.foods WHERE id = public.food_variants.food_id
);

-- Delete orphaned meal foods
DELETE FROM public.meal_foods
WHERE food_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.foods WHERE id = public.meal_foods.food_id
);

-- Delete orphaned meal plans
DELETE FROM public.meal_plans
WHERE food_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.foods WHERE id = public.meal_plans.food_id
);

-- Delete orphaned meal plan template assignments
DELETE FROM public.meal_plan_template_assignments
WHERE food_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.foods WHERE id = public.meal_plan_template_assignments.food_id
);

-- Delete orphaned exercise entries
DELETE FROM public.exercise_entries
WHERE exercise_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.exercises WHERE id = public.exercise_entries.exercise_id
);

-- Phase 2: Add or update foreign key constraints with ON DELETE CASCADE

-- food_entries
ALTER TABLE public.food_entries
ADD CONSTRAINT fk_food_entries_food_id
FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

-- food_variants
ALTER TABLE public.food_variants
ADD CONSTRAINT fk_food_variants_food_id
FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

-- meal_foods
ALTER TABLE public.meal_foods
DROP CONSTRAINT IF EXISTS meal_foods_food_id_fkey,
ADD CONSTRAINT meal_foods_food_id_fkey
FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

-- meal_plans
ALTER TABLE public.meal_plans
DROP CONSTRAINT IF EXISTS meal_plans_food_id_fkey,
ADD CONSTRAINT meal_plans_food_id_fkey
FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

-- meal_plan_template_assignments
-- This constraint was already set to ON DELETE CASCADE, but we'll ensure it's correct
ALTER TABLE public.meal_plan_template_assignments
DROP CONSTRAINT IF EXISTS fk_food,
ADD CONSTRAINT fk_food
FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

-- exercise_entries
-- First, ensure the referenced table has a primary key
ALTER TABLE public.exercises
ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);

ALTER TABLE public.exercise_entries
ADD CONSTRAINT fk_exercise_entries_exercise_id
FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;

COMMIT;