-- Migration: Better Auth 1.5 Upgrade
-- Description: Renames 'user_id' to 'reference_id' and adds 'config_id' to the 'api_key' table

ALTER TABLE public.api_key RENAME COLUMN user_id TO reference_id;
ALTER TABLE public.api_key ADD COLUMN config_id TEXT;

COMMENT ON COLUMN public.api_key.reference_id IS 'Renamed from user_id to match Better Auth 1.5 API Key plugin requirement';
COMMENT ON COLUMN public.api_key.config_id IS 'Added for Better Auth 1.5 multi-config support';

-- Data migration: Ensure existing keys are assigned to the 'default' configuration
UPDATE public.api_key SET config_id = 'default' WHERE config_id IS NULL;
