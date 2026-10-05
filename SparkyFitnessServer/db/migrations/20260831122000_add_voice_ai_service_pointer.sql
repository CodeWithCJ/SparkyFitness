-- Migration: Add optional per-user voice AI service pointer
-- Created at: 2026-08-31 12:20:00
--
-- NULL keeps the free platform speech recognizer. A selected service routes
-- recorded audio to that configured model without exposing its API key to the
-- mobile client.

BEGIN;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS active_voice_ai_service_id UUID
  REFERENCES public.ai_service_settings(id) ON DELETE SET NULL;

COMMIT;
