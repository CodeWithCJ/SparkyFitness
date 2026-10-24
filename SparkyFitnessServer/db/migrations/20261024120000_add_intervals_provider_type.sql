-- Migration: Add the Intervals.icu provider type (API-key based, like Hevy and Liftosaur).
-- File: SparkyFitnessServer/db/migrations/20261024120000_add_intervals_provider_type.sql
--
-- The athlete ID is stored in external_data_providers.app_id and the API key in
-- app_key, both encrypted. Never shared (is_strictly_private = TRUE).

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('intervals', 'Intervals.icu', 'Activities and wellness from Intervals.icu via API key')
ON CONFLICT (id) DO NOTHING;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['app_id', 'app_key'],
    field_labels = '{"app_id": "Athlete ID", "app_key": "API Key"}'::jsonb,
    is_strictly_private = TRUE
WHERE id = 'intervals';
