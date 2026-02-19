-- Migration: Rename is_global to is_public in ai_service_settings
-- Description: Renames is_global column to is_public for consistency with other tables
-- Date: 2026-02-16

BEGIN;

-- Rename the column
ALTER TABLE public.ai_service_settings 
RENAME COLUMN is_global TO is_public;

-- Update the constraint name and definition
ALTER TABLE public.ai_service_settings
DROP CONSTRAINT IF EXISTS check_global_settings_user_id_null;

ALTER TABLE public.ai_service_settings
ADD CONSTRAINT check_public_settings_user_id_null 
CHECK (
  (is_public = TRUE AND user_id IS NULL) OR 
  (is_public = FALSE AND user_id IS NOT NULL)
);

-- Drop old indexes
DROP INDEX IF EXISTS public.idx_ai_service_settings_is_global;
DROP INDEX IF EXISTS public.idx_ai_service_settings_active_global;

-- Create new indexes with is_public
CREATE INDEX IF NOT EXISTS idx_ai_service_settings_is_public 
ON public.ai_service_settings(is_public) 
WHERE is_public = TRUE;

-- Add index on is_active and is_public for efficient active public setting lookup
CREATE INDEX IF NOT EXISTS idx_ai_service_settings_active_public 
ON public.ai_service_settings(is_active, is_public) 
WHERE is_active = TRUE AND is_public = TRUE;

COMMIT;
