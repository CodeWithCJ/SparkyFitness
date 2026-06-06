-- SparkyFitnessServer/db/migrations/20260122201500_refactor_provider_type_to_lookup_table.sql

-- 1. Create the lookup table
CREATE TABLE IF NOT EXISTS public.external_provider_types (
    id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Populate the lookup table with existing provider types
INSERT INTO public.external_provider_types (id, display_name) VALUES
('fatsecret', 'FatSecret'),
('openfoodfacts', 'Open Food Facts'),
('mealie', 'Mealie'),
('garmin', 'Garmin Connect'),
('health', 'Health (Generic)'),
('nutritionix', 'Nutritionix'),
('wger', 'wger'),
('free-exercise-db', 'Free Exercise DB'),
('withings', 'Withings'),
('tandoor', 'Tandoor Recipes'),
('usda', 'USDA Food Database'),
('fitbit', 'Fitbit')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- 3. Drop the existing CHECK constraint from external_data_providers
ALTER TABLE public.external_data_providers
DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;

-- 4. Add the Foreign Key constraint to external_data_providers
-- This ensures that only valid provider types from our lookup table can be used.
ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_fkey
FOREIGN KEY (provider_type) REFERENCES public.external_provider_types(id);

-- Add a comment for clarity
COMMENT ON COLUMN public.external_data_providers.provider_type IS 'References the external_provider_types table. Refactored from a CHECK constraint to a lookup table.';
