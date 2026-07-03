-- SparkyFitnessServer/db/migrations/20260607000000_add_googlehealth_provider_type.sql
-- Adds Google Health as a new external data provider type (replaces deprecated Fitbit Web API)
-- See: https://github.com/CodeWithCJ/SparkyFitness/issues/1236

INSERT INTO public.external_provider_types (id, display_name)
VALUES ('googlehealth', 'Google Health')
ON CONFLICT (id) DO NOTHING;
