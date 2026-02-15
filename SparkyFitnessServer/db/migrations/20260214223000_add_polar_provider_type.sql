-- SparkyFitnessServer/db/migrations/20260214223000_add_polar_provider_type.sql

INSERT INTO public.external_provider_types (id, display_name)
VALUES ('polar', 'Polar Flow')
ON CONFLICT (id) DO NOTHING;
