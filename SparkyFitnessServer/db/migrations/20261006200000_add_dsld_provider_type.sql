-- Migration: Add the NIH Dietary Supplement Label Database (DSLD) provider type
-- File: SparkyFitnessServer/db/migrations/20261006200000_add_dsld_provider_type.sql
--
-- The supplement barcode lookup (`GET /api/v2/medications/supplement-lookup`) runs
-- only for users who can see an active 'dsld' provider, so it can be switched off
-- like any other external provider. The label database is public and needs no key.

BEGIN;

-- 1. Register the provider type
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'dsld',
  'NIH Dietary Supplement Label Database',
  'US National Institutes of Health database of dietary supplement labels. Used to fill in a supplement from the barcode on its package.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['supplement'],
    required_fields = ARRAY[]::VARCHAR[],
    is_strictly_private = FALSE,
    supports_barcode = TRUE
WHERE id = 'dsld';

-- 2. Add it to the providers every new instance gets (keeps the existing entries)
CREATE OR REPLACE FUNCTION public.create_global_default_providers(p_admin_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Free Exercise DB
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Wger
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Wger', 'wger', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Open Food Facts
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Swiss Food Database
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Swiss Food Database', 'swissfood', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Canadian Nutrient File
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Canadian Nutrient File', 'canadian-nutrient-file', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- NIH Dietary Supplement Label Database
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'NIH Dietary Supplement Label Database', 'dsld', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
END;
$$;

-- 3. Seed for the existing admin user if one exists
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM public."user" WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.external_data_providers (
      user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
    ) VALUES (
      v_admin_id, 'NIH Dietary Supplement Label Database', 'dsld', TRUE, TRUE, now(), now()
    ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
  END IF;
END $$;

COMMIT;
