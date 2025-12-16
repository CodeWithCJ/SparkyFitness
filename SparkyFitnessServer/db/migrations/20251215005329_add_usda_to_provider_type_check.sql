ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;

ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('fatsecret', 'openfoodfacts', 'mealie', 'garmin', 'health','nutritionix','wger', 'free-exercise-db', 'withings', 'tandoor', 'usda'));