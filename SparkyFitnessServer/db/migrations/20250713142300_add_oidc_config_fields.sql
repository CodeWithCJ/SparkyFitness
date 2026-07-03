-- Migration to add new configuration fields to oidc_settings table

ALTER TABLE oidc_settings
ADD COLUMN id_token_signed_response_alg VARCHAR(50) DEFAULT 'RS256',
ADD COLUMN userinfo_signed_response_alg VARCHAR(50) DEFAULT 'none',
ADD COLUMN request_timeout INTEGER DEFAULT 30000,
ADD COLUMN auto_register BOOLEAN DEFAULT FALSE;