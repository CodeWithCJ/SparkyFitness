-- Migration: Add optional vision AI service pointers
-- Created at: 2026-06-28 12:00:00
--
-- Adds a per-user vision-service pointer and an admin global vision-service
-- default. Both are nullable; when unset, vision features fall back to the
-- existing active/default text service, so behavior is unchanged on upgrade.

BEGIN;

-- Per-user override: route vision tasks (food-photo, label scan) to a
-- dedicated service. Falls back to active_ai_service_id when NULL.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS active_vision_ai_service_id UUID
  REFERENCES public.ai_service_settings(id) ON DELETE SET NULL;

-- Admin global default applied to users on the global default text service.
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS default_vision_ai_service_id UUID
  REFERENCES public.ai_service_settings(id) ON DELETE SET NULL;

COMMIT;
