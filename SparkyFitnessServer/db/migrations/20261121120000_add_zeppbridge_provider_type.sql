-- Migration: Add the ZeppBridge provider type (Amazfit / Zepp, #301).
-- File: SparkyFitnessServer/db/migrations/20261121120000_add_zeppbridge_provider_type.sql
--
-- SparkyFitness never talks to Zepp. It pulls from the user's own ZeppBridge
-- (`zeppbridge-cli serve`, GET /v1/records): the ZeppBridge address is stored in
-- external_data_providers.base_url and the read-only pull token in app_key
-- (encrypted). Never shared (is_strictly_private = TRUE). No new table.

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('zeppbridge', 'ZeppBridge (Amazfit / Zepp)', 'Sleep, workouts and daily metrics pulled from your own ZeppBridge server')
ON CONFLICT (id) DO NOTHING;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['base_url', 'app_key'],
    field_labels = '{"base_url": "ZeppBridge URL", "app_key": "Pull token"}'::jsonb,
    is_strictly_private = TRUE
WHERE id = 'zeppbridge';
