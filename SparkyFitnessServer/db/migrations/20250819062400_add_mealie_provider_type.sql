-- Add 'mealie' to the provider_type enum for external_data_providers
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;

ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('openfoodfacts', 'nutritionix', 'fatsecret', 'wger', 'mealie'));