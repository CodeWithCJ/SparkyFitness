-- SparkyFitnessServer/db/migrations/20261021120200_add_valhalla_routing_provider_type.sql
-- Add the Valhalla routing provider type. Route generation and "Follow roads"
-- use the routing service a person (or the admin, as a global provider) adds in
-- Settings > External Providers: a base URL plus an optional API key, stored
-- encrypted in external_data_providers.app_key like the other providers' keys.
--
-- No new table or column, so no RLS change: external_data_providers keeps its
-- owner / public / family-share policies. Not strictly private, so an admin can
-- offer one routing service to everyone (is_public) and a person can share
-- theirs through share_external_providers, like Mealie or Tandoor.


INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'valhalla',
  'Valhalla routing',
  'Routing service for generating routes and snapping drawn routes to roads and trails. Route points are sent to the server you choose.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['base_url'],
    field_labels = '{"base_url": "Valhalla server URL", "app_key": "API key (optional)"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'valhalla';

