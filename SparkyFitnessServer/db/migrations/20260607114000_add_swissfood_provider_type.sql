-- Migration: Add Swiss Food Composition Database provider type and enable by default
-- File: SparkyFitnessServer/db/migrations/20260607114000_add_swissfood_provider_type.sql

-- 1. Insert 'swissfood' provider type into lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'swissfood',
  'Swiss Food Database',
  'Public database on the composition of foods available in Switzerland, provided by the Federal Food Safety and Veterinary Office FSVO.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- 2. Update create_default_external_data_providers to include swissfood for new users
CREATE OR REPLACE FUNCTION public.create_default_external_data_providers(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Insert default 'free-exercise-db' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;

  -- Insert default 'wger' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Wger', 'wger', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;

  -- Insert default 'openfoodfacts' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;

  -- Insert default 'swissfood' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Swiss Food Database', 'swissfood', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;
END;
$$;

-- 3. Enable it for all existing users in the system
INSERT INTO public.external_data_providers (
  user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
)
SELECT id, 'Swiss Food Database', 'swissfood', TRUE, FALSE, now(), now()
FROM public."user"
ON CONFLICT (user_id, provider_name) DO NOTHING;
