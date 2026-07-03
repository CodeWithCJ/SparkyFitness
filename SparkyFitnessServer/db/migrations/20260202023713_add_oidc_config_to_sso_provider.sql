-- Migration to add oidc_config column to sso_provider table

ALTER TABLE "sso_provider"
ADD COLUMN IF NOT EXISTS oidc_config TEXT;
