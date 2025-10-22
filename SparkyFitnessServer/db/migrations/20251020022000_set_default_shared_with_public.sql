-- Update existing NULL values to FALSE
UPDATE public.foods SET shared_with_public = FALSE WHERE shared_with_public IS NULL;

-- Alter the table to set the default value to FALSE
ALTER TABLE public.foods ALTER COLUMN shared_with_public SET DEFAULT FALSE;