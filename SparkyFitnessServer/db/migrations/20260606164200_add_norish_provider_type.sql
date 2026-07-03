-- Add Norish provider type to the lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'norish',
  'Norish Recipes',
  'External food provider using Norish Recipe API.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;
