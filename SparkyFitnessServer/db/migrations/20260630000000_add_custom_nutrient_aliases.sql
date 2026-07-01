-- Add aliases column to user_custom_nutrients.
-- `aliases` holds the alternate naming conventions online food providers may
-- use for this nutrient (e.g. "magnesium, mg"). On food import we match these
-- (and the nutrient name) against provider nutrient fields to populate custom
-- nutrient values. Stored as a JSONB array of strings to match the existing
-- custom_nutrients JSONB convention.
ALTER TABLE public.user_custom_nutrients
ADD COLUMN aliases JSONB NOT NULL DEFAULT '[]'::jsonb;
