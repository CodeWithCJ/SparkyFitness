-- SparkyFitnessServer/db/migrations/20260715120000_add_oura_provider_type.sql

INSERT INTO public.external_provider_types (id, display_name)
VALUES ('oura', 'Oura Ring')
ON CONFLICT (id) DO NOTHING;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['app_id', 'app_key'],
    is_strictly_private = TRUE
WHERE id = 'oura';
