-- Update the check constraint for provider_type to include 'garmin' and 'health'
-- First, drop the old constraint if it exists
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;

-- Add the new constraint with 'garmin' and 'health'
ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('fatsecret', 'openfoodfacts', 'mealie', 'garmin', 'health','nutritionix','wger'));