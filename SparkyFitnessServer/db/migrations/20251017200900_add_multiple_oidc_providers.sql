-- Migration to support multiple OIDC providers and custom branding

-- 1. Create the new `oidc_providers` table
CREATE TABLE oidc_providers (
    id SERIAL PRIMARY KEY,
    issuer_url TEXT NOT NULL,
    client_id TEXT NOT NULL,
    encrypted_client_secret TEXT,
    client_secret_iv TEXT,
    client_secret_tag TEXT,
    redirect_uris TEXT[] NOT NULL,
    scope TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_post',
    response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_register BOOLEAN NOT NULL DEFAULT FALSE,
    display_name TEXT,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create the new `user_oidc_links` table
CREATE TABLE user_oidc_links (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    oidc_provider_id INTEGER NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
    oidc_sub TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (oidc_provider_id, oidc_sub)
);

-- 3. Migrate data from the old `oidc_settings` table to `oidc_providers`
DO $$
DECLARE
    old_settings RECORD;
    new_provider_id INTEGER;
BEGIN
    -- Check if the old oidc_settings table exists and has data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oidc_settings') THEN
        -- Fetch the most recent setting from the old table
        SELECT * INTO old_settings FROM oidc_settings ORDER BY created_at DESC LIMIT 1;

        -- If a setting was found, insert it into the new table
        IF FOUND THEN
            INSERT INTO oidc_providers (
                issuer_url, client_id, encrypted_client_secret, client_secret_iv, client_secret_tag,
                redirect_uris, scope, token_endpoint_auth_method, response_types, is_active,
                auto_register
            )
            VALUES (
                old_settings.issuer_url, old_settings.client_id, old_settings.encrypted_client_secret,
                old_settings.client_secret_iv, old_settings.client_secret_tag, old_settings.redirect_uris,
                old_settings.scope, old_settings.token_endpoint_auth_method, old_settings.response_types,
                old_settings.is_active, old_settings.auto_register
            )
            RETURNING id INTO new_provider_id;

            -- 4. Migrate user `oidc_sub` data to `user_oidc_links`
            IF new_provider_id IS NOT NULL THEN
                INSERT INTO user_oidc_links (user_id, oidc_provider_id, oidc_sub)
                SELECT id, new_provider_id, oidc_sub
                FROM auth.users
                WHERE oidc_sub IS NOT NULL;
            END IF;
        END IF;
    END IF;
END $$;

-- 5. Drop the old `oidc_sub` column from `auth.users`
ALTER TABLE auth.users DROP COLUMN IF EXISTS oidc_sub;

-- 6. Drop the old `oidc_settings` table
DROP TABLE IF EXISTS oidc_settings;

-- Add triggers for the new tables to automatically update the `updated_at` column
CREATE TRIGGER update_oidc_providers_updated_at
BEFORE UPDATE ON oidc_providers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_oidc_links_updated_at
BEFORE UPDATE ON user_oidc_links
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();