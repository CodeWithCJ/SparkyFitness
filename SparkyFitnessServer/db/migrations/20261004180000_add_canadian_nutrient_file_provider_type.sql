-- Migration: Add Canadian Nutrient File (Health Canada) provider type
-- File: SparkyFitnessServer/db/migrations/20261004180000_add_canadian_nutrient_file_provider_type.sql


-- 1. Insert 'canadian-nutrient-file' into external_provider_types lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'canadian-nutrient-file',
  'Canadian Nutrient File',
  'Health Canada bilingual reference food composition database reporting average nutrient values in Canadian foods.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY[]::VARCHAR[],
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'canadian-nutrient-file';

-- 2. Update create_global_default_providers to include canadian-nutrient-file
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
END;
$$;

-- 3. Seed for existing admin user if one exists
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM public."user" WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.external_data_providers (
      user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
    ) VALUES (
      v_admin_id, 'Canadian Nutrient File', 'canadian-nutrient-file', TRUE, TRUE, now(), now()
    ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
  END IF;
END $$;

-- 4. Performance indexes for food_variants and foods lookups/pagination
CREATE INDEX IF NOT EXISTS idx_food_variants_food_id
  ON public.food_variants(food_id);

CREATE INDEX IF NOT EXISTS idx_food_variants_default_lookup
  ON public.food_variants(food_id, is_default, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_foods_is_quick_food_name
  ON public.foods(is_quick_food, name);

CREATE INDEX IF NOT EXISTS idx_foods_shared_public_name
  ON public.foods(shared_with_public, is_quick_food, name);


