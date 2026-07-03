-- Rename food_data_providers table to external_data_providers
ALTER TABLE public.food_data_providers RENAME TO external_data_providers;

-- Update the check constraint for provider_type to include 'wger'
-- First, drop the old constraint if it exists
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS food_data_providers_provider_type_check;

-- Add the new constraint with 'wger'
ALTER TABLE public.external_data_providers
ADD CONSTRAINT external_data_providers_provider_type_check
CHECK (provider_type IN ('openfoodfacts', 'nutritionix', 'fatsecret', 'wger'));

-- Add source_external_id column to public.exercises table
ALTER TABLE public.exercises
ADD COLUMN source_external_id TEXT;

-- Rename the function that updates the 'updated_at' timestamp for consistency
ALTER FUNCTION public.update_food_data_providers_updated_at() RENAME TO update_external_data_providers_updated_at;

-- Drop the old trigger that referenced the old table name and function name
DROP TRIGGER IF EXISTS update_food_data_providers_updated_at_trigger ON public.external_data_providers;

-- Recreate the trigger with the new table name and function name
CREATE TRIGGER update_external_data_providers_updated_at_trigger
BEFORE UPDATE ON public.external_data_providers
FOR EACH ROW EXECUTE FUNCTION public.update_external_data_providers_updated_at();