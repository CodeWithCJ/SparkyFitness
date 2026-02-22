-- SparkyFitnessServer/db/migrations/20260222100000_add_strava_provider_type.sql

INSERT INTO public.external_provider_types (id, display_name)
VALUES ('strava', 'Strava')
ON CONFLICT (id) DO NOTHING;
