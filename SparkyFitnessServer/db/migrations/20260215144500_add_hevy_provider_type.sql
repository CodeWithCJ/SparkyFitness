-- SparkyFitnessServer/db/migrations/20260215144500_add_hevy_provider_type.sql

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('hevy', 'Hevy', 'Workout tracking app integration via API Key')
ON CONFLICT (id) DO NOTHING;
