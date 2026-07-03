-- Add serving_size and serving_unit to meals table to support meal portioning
-- This mirrors the food_variants pattern where serving sizes are defined per variant

ALTER TABLE public.meals
ADD COLUMN serving_size NUMERIC DEFAULT 1.0 NOT NULL,
ADD COLUMN serving_unit TEXT DEFAULT 'serving' NOT NULL;

COMMENT ON COLUMN public.meals.serving_size IS 'Defines the reference serving size for this meal (e.g., 200 for 200g or 1000 for 1000ml)';
COMMENT ON COLUMN public.meals.serving_unit IS 'Unit of measurement for the serving size (e.g., g, ml, serving, oz, cup)';


-- Add quantity and unit to food_entry_meals table to track consumed portions
-- This mirrors the food_entries pattern where quantity/unit represents what the user consumed

ALTER TABLE public.food_entry_meals
ADD COLUMN quantity NUMERIC DEFAULT 1.0 NOT NULL,
ADD COLUMN unit TEXT DEFAULT 'serving';

COMMENT ON COLUMN public.food_entry_meals.quantity IS 'Amount of the meal consumed (e.g., 0.5 for half serving, 500 for 500ml)';
COMMENT ON COLUMN public.food_entry_meals.unit IS 'Unit of measurement for the consumed quantity (should match meals.serving_unit)';

