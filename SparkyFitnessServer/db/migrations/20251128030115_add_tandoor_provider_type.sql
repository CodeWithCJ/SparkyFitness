-- Drop the existing provider_type check constraint
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;

-- Add a new check constraint with 'tandoor' included
ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('fatsecret', 'openfoodfacts', 'mealie', 'garmin', 'health', 'nutritionix', 'wger', 'free-exercise-db', 'withings', 'tandoor'));