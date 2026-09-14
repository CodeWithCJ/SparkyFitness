-- SparkyFitnessServer/db/migrations/20260817000000_add_liftosaur_provider_type.sql
-- Add the Liftosaur workout-tracking provider type (API-key based, like Hevy).
-- Liftosaur credentials are stored encrypted in external_data_providers.app_key
-- and never shared (is_strictly_private = TRUE, matching the other wearable /
-- workout-tracker integrations).

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('liftosaur', 'Liftosaur', 'Workout tracking app integration via API key (liftosaur.com)')
ON CONFLICT (id) DO NOTHING;

UPDATE public.external_provider_types
SET categories = ARRAY['exercise'],
    required_fields = ARRAY['app_key'],
    field_labels = '{"app_key": "Liftosaur API Key"}'::jsonb,
    is_strictly_private = TRUE
WHERE id = 'liftosaur';
