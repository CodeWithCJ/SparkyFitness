-- Migration: Add global AI service settings support
-- Description: Adds is_global column to ai_service_settings table to support global (organization-wide) AI configurations
-- Date: 2026-02-16

BEGIN;

-- First, make user_id nullable to support global settings
-- This allows global settings (is_global = TRUE) to have user_id = NULL
ALTER TABLE public.ai_service_settings 
ALTER COLUMN user_id DROP NOT NULL;

-- Add is_global column with default FALSE
ALTER TABLE public.ai_service_settings 
ADD COLUMN IF NOT EXISTS is_global boolean DEFAULT FALSE NOT NULL;

-- Add constraint: global settings must have user_id = NULL, user settings must have user_id NOT NULL
ALTER TABLE public.ai_service_settings
DROP CONSTRAINT IF EXISTS check_global_settings_user_id_null;

ALTER TABLE public.ai_service_settings
ADD CONSTRAINT check_global_settings_user_id_null 
CHECK (
  (is_global = TRUE AND user_id IS NULL) OR 
  (is_global = FALSE AND user_id IS NOT NULL)
);

-- Add index on is_global for query performance
CREATE INDEX IF NOT EXISTS idx_ai_service_settings_is_global 
ON public.ai_service_settings(is_global) 
WHERE is_global = TRUE;

-- Add index on is_active and is_global for efficient active global setting lookup
CREATE INDEX IF NOT EXISTS idx_ai_service_settings_active_global 
ON public.ai_service_settings(is_active, is_global) 
WHERE is_active = TRUE AND is_global = TRUE;

-- Ensure existing rows have is_global = FALSE (should already be default, but explicit for safety)
UPDATE public.ai_service_settings 
SET is_global = FALSE 
WHERE is_global IS NULL OR is_global IS NOT FALSE;

COMMIT;
