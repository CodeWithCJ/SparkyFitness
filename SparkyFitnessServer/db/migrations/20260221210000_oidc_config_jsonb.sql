-- Store oidc_config as JSONB so Better Auth's adapter receives an object when reading
-- the provider row (avoids "invalid_provider" when the plugin expects parsed config).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sso_provider' AND column_name = 'oidc_config'
        AND data_type = 'text'
    ) THEN
        ALTER TABLE "sso_provider"
        ALTER COLUMN oidc_config TYPE JSONB USING oidc_config::jsonb;
    END IF;
END $$;
