-- Migration: Add enable_passkey_login to global_settings
-- Description: Lets admins turn off passkey sign-in and new passkey registration.
-- SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN=true still forces it off.
-- Date: 2026-09-29


ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS enable_passkey_login boolean DEFAULT TRUE NOT NULL;

