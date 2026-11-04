-- Migration: Add enable_magic_link_login to global_settings
-- Description: Lets admins turn off magic link sign-in.
-- SPARKY_FITNESS_DISABLE_MAGIC_LINK_LOGIN=true still forces it off.
-- Date: 2026-11-03


ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS enable_magic_link_login boolean DEFAULT TRUE NOT NULL;
