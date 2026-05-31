-- Add allergens and traces columns to food_variants and food_entries
ALTER TABLE public.food_variants
ADD COLUMN allergens text[],
ADD COLUMN traces text[];

ALTER TABLE public.food_entries
ADD COLUMN allergens text[],
ADD COLUMN traces text[];
