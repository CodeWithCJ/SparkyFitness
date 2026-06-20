-- Migration: Support public sharing and dynamic provider type metadata
-- Created at: 2026-06-20 14:33:00

BEGIN;

-- 1. Add metadata columns to external_provider_types
ALTER TABLE public.external_provider_types ADD COLUMN IF NOT EXISTS categories VARCHAR(50)[];
ALTER TABLE public.external_provider_types ADD COLUMN IF NOT EXISTS required_fields VARCHAR(50)[];
ALTER TABLE public.external_provider_types ADD COLUMN IF NOT EXISTS field_labels JSONB;
ALTER TABLE public.external_provider_types ADD COLUMN IF NOT EXISTS supports_barcode BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Populate columns for existing provider types
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY['base_url', 'app_key'] WHERE id = 'mealie';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY['base_url', 'app_key'] WHERE id = 'tandoor';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY['base_url', 'app_key'] WHERE id = 'norish';
UPDATE public.external_provider_types SET categories = ARRAY['food', 'exercise'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'nutritionix';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'fatsecret';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'withings';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'fitbit';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'googlehealth';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'garmin';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'polar';
UPDATE public.external_provider_types SET categories = ARRAY['other'], required_fields = ARRAY['app_id', 'app_key'] WHERE id = 'strava';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY['app_key'] WHERE id = 'usda';
UPDATE public.external_provider_types SET categories = ARRAY['exercise'], required_fields = ARRAY['app_key'] WHERE id = 'hevy';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY[]::VARCHAR[] WHERE id = 'openfoodfacts';
UPDATE public.external_provider_types SET categories = ARRAY['exercise'], required_fields = ARRAY[]::VARCHAR[] WHERE id = 'wger';
UPDATE public.external_provider_types SET categories = ARRAY['exercise'], required_fields = ARRAY[]::VARCHAR[] WHERE id = 'free-exercise-db';
UPDATE public.external_provider_types SET categories = ARRAY['food'], required_fields = ARRAY[]::VARCHAR[] WHERE id = 'swissfood';

UPDATE public.external_provider_types 
SET categories = ARRAY['food'], 
    required_fields = ARRAY['app_id', 'app_key', 'yazio_client_id', 'yazio_client_secret'], 
    field_labels = '{"app_id": "YAZIO email / username", "app_key": "YAZIO password", "yazio_client_id": "YAZIO Client ID", "yazio_client_secret": "YAZIO Client Secret"}'::jsonb 
WHERE id = 'yazio';

UPDATE public.external_provider_types SET supports_barcode = TRUE WHERE id IN ('openfoodfacts', 'usda', 'fatsecret', 'yazio');

-- Set default to TRUE so new provider types are private unless explicitly opted out
ALTER TABLE public.external_provider_types ALTER COLUMN is_strictly_private SET DEFAULT TRUE;

-- Ensure all strictly private provider types are marked as private
UPDATE public.external_provider_types 
SET is_strictly_private = TRUE 
WHERE id IN ('fitbit', 'garmin', 'withings', 'googlehealth', 'polar', 'strava','hevy');

-- 3. Ensure public.ai_service_settings has a primary key constraint on id before adding foreign keys referencing it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conrelid = 'public.ai_service_settings'::regclass 
          AND contype = 'p'
    ) THEN
        ALTER TABLE public.ai_service_settings ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 4. Add active_ai_service_id to user_preferences
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS active_ai_service_id UUID REFERENCES public.ai_service_settings(id) ON DELETE SET NULL;





-- Drop old policies that depend on the old column
DROP POLICY IF EXISTS select_policy ON public.external_data_providers;
DROP POLICY IF EXISTS modify_policy ON public.external_data_providers;
DROP POLICY IF EXISTS insert_policy ON public.external_data_providers;
DROP POLICY IF EXISTS update_policy ON public.external_data_providers;
DROP POLICY IF EXISTS delete_policy ON public.external_data_providers;

-- 1. Add is_public column (admin-managed global providers)
ALTER TABLE public.external_data_providers 
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Remove shared_with_public — user-level credential sharing is replaced by admin is_public
ALTER TABLE public.external_data_providers 
  DROP COLUMN IF EXISTS shared_with_public;

-- 3. Index for efficient global provider lookups
CREATE INDEX IF NOT EXISTS idx_external_data_providers_is_public 
  ON public.external_data_providers(is_public);






-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Redefine create_default_external_data_providers as a no-op.
--    Future new-user triggers no longer call it, but the function must still
--    exist so older code paths referencing it don't break.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_default_external_data_providers(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- No-op: default providers are now instance-level global records (is_public = TRUE).
  -- See create_global_default_providers() for the one-time seeding logic.
  NULL;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Redefine handle_new_user — remove the per-user provider call.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure onboarding_status exists
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- NOTE: default external data providers are now global (is_public = TRUE).
  -- They are seeded once when the first admin is created; no per-user rows needed.

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Create the one-time global provider seeding function.
--    Called with the admin's user_id so user_id is never NULL.
-- ──────────────────────────────────────────────────────────────────────────────
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
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Update the first-user trigger to also seed global providers.
--    The BEFORE INSERT trigger sets NEW.role = 'admin'.
--    We add an AFTER INSERT trigger to seed providers with the new user's id.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_global_providers_for_first_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Only seed if this user is the admin (first ever user)
  IF NEW.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.external_data_providers WHERE is_public = TRUE LIMIT 1
  ) THEN
    PERFORM public.create_global_default_providers(NEW.id);
    RAISE NOTICE 'Global default providers seeded for first admin: %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS seed_global_providers_on_first_admin ON public."user";
CREATE TRIGGER seed_global_providers_on_first_admin
  AFTER INSERT ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.seed_global_providers_for_first_admin();

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Seed global providers for EXISTING installations.
--    Uses the first admin's user_id. Skips if global providers already exist.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Only run if no global providers exist yet
  IF NOT EXISTS (SELECT 1 FROM public.external_data_providers WHERE is_public = TRUE) THEN
    -- Find the first admin user
    SELECT id INTO v_admin_id
    FROM public."user"
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      PERFORM public.create_global_default_providers(v_admin_id);
      RAISE NOTICE 'Seeded global default providers using admin user_id: %', v_admin_id;
    ELSE
      RAISE NOTICE 'No admin user found — global providers will be seeded when the first admin signs up.';
    END IF;
  ELSE
    RAISE NOTICE 'Global providers already exist — skipping seed.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Remove per-user duplicate rows for the four now-global provider types.
--    Only removes rows where a global (is_public = TRUE) row for the same type exists,
--    keeping any user-customised rows for other types untouched.
-- ──────────────────────────────────────────────────────────────────────────────
DELETE FROM public.external_data_providers edp
WHERE edp.is_public = FALSE
  AND edp.provider_type IN ('free-exercise-db', 'wger', 'openfoodfacts', 'swissfood')
  AND EXISTS (
    SELECT 1 FROM public.external_data_providers g
    WHERE g.is_public = TRUE AND g.provider_type = edp.provider_type
  );




ALTER TABLE public.ai_service_settings
  DROP COLUMN IF EXISTS shared_with_public;




COMMIT;
