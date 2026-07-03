-- Migration: Set default quantity and unit for meal assignments
-- This ensures existing meal plan template assignments have proper default values

-- Update meal_plan_template_assignments to set default quantity and unit for meals
UPDATE meal_plan_template_assignments
SET 
  quantity = 1.0,
  unit = 'serving'
WHERE 
  item_type = 'meal'
  AND (quantity IS NULL OR unit IS NULL);
