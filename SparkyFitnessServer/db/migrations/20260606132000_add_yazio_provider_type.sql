-- Add YAZIO provider type to the lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'yazio',
  'YAZIO',
  'Experimental food provider using YAZIO private API credentials. May break if YAZIO changes its API.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;
