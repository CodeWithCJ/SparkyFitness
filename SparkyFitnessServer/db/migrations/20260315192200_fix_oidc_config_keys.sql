-- Migration to fix OIDC configuration keys and enable UserInfo override for existing providers
-- Rename clientSecretAuthMethod to tokenEndpointAuthentication inside the oidc_config JSONB column
-- And set overrideUserInfo to true

UPDATE "sso_provider"
SET oidc_config = jsonb_set(
    jsonb_set(
        -- First, remove the old key if it exists and use its value for the new key if applicable
        -- Better Auth uses tokenEndpointAuthentication
        oidc_config - 'clientSecretAuthMethod',
        '{tokenEndpointAuthentication}',
        COALESCE(oidc_config->'clientSecretAuthMethod', '"client_secret_post"')
    ),
    '{overrideUserInfo}',
    'true'
)
WHERE oidc_config IS NOT NULL AND oidc_config != '{}'::jsonb;
