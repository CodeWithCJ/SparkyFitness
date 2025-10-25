-- Add 'withings' to provider_type check constraint
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;
ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('fatsecret', 'openfoodfacts', 'mealie', 'garmin', 'health', 'nutritionix', 'wger', 'free-exercise-db', 'withings'));

-- Add new columns for Withings tokens and generic sync settings
ALTER TABLE public.external_data_providers
ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT,
ADD COLUMN IF NOT EXISTS access_token_iv TEXT,
ADD COLUMN IF NOT EXISTS access_token_tag TEXT,
ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token_iv TEXT,
ADD COLUMN IF NOT EXISTS refresh_token_tag TEXT,
ADD COLUMN IF NOT EXISTS scope TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'manual';