-- Migration to add the glycemic_index column to the food_variants table
ALTER TABLE public.food_variants
ADD COLUMN glycemic_index TEXT;

-- Add a CHECK constraint to ensure glycemic_index values are within the allowed categories for food_variants table
ALTER TABLE public.food_variants
ADD CONSTRAINT food_variants_glycemic_index_check
CHECK (glycemic_index IN ('None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'));