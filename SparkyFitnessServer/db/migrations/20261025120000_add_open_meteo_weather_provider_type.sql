-- SparkyFitnessServer/db/migrations/20261025120000_add_open_meteo_weather_provider_type.sql
-- Add the Open-Meteo compatible weather provider type. The weather at the start
-- of a GPS-recorded activity is looked up from the service a person (or the
-- admin, as a global provider) adds in Settings > External Providers: a base
-- URL plus an optional API key, stored encrypted in
-- external_data_providers.app_key like the other providers' keys. With no such
-- provider nothing is looked up and nothing is sent anywhere.
--
-- No new table or column, so no RLS change: external_data_providers keeps its
-- owner / public / family-share policies. Not strictly private, so an admin can
-- offer one weather service to everyone (is_public) and a person can share
-- theirs through share_external_providers, like the Valhalla routing provider.

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'open_meteo',
  'Weather (Open-Meteo compatible)',
  'Weather service used to add the temperature and conditions to GPS-recorded activities. The start time of the activity and its start place, rounded to two decimals, are sent to the server you choose.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['base_url'],
    field_labels = '{"base_url": "Open-Meteo server URL", "app_key": "API key (optional)"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'open_meteo';
