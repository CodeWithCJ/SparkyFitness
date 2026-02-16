-- Migration: Add allow_user_ai_config to global_settings
-- Description: Allows admins to restrict per-user AI service configuration
-- Date: 2026-02-16

BEGIN;

-- Add allow_user_ai_config column to global_settings table
ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS allow_user_ai_config boolean DEFAULT TRUE NOT NULL;

-- Set default value for existing row
UPDATE public.global_settings
SET allow_user_ai_config = TRUE
WHERE id = 1 AND allow_user_ai_config IS NULL;

COMMIT;
