-- Provider types are now enforced through external_provider_types.
-- Keep this migration as a cleanup no-op for databases that still have the
-- legacy check constraint from older migration paths.
ALTER TABLE public.external_data_providers DROP CONSTRAINT IF EXISTS external_data_providers_provider_type_check;
