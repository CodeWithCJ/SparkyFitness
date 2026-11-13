-- Migration: Add enable_version_check to global_settings
-- Description: Lets admins turn off the GitHub latest-release lookup behind
-- /api/version/latest-github. On by default, so existing installs keep checking.
-- Date: 2026-10-25


ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS enable_version_check boolean DEFAULT TRUE NOT NULL;
