-- Migration: Add voice input support, AI service pointer, and capabilities
-- Created at: 2026-09-30 17:45:00
--
-- Adds voice dictation preferences (toggle and active AI service pointer)
-- to user_preferences and audio input capability flag to ai_service_settings.

BEGIN;

-- 1. Voice AI service pointer in user_preferences
-- NULL keeps the free platform speech recognizer. A selected service routes
-- recorded audio to that configured model without exposing its API key to the client.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS active_voice_ai_service_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_preferences_active_voice_ai_service_id_fkey'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_active_voice_ai_service_id_fkey
      FOREIGN KEY (active_voice_ai_service_id)
      REFERENCES public.ai_service_settings(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- 2. Voice input visibility toggle in user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS voice_input_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.user_preferences.voice_input_enabled IS
  'Shows voice input in web and mobile chat. Disabling preserves the selected Voice configuration.';

-- 3. Audio input capability flag in ai_service_settings
ALTER TABLE public.ai_service_settings
  ADD COLUMN IF NOT EXISTS supports_audio_input BOOLEAN NOT NULL DEFAULT FALSE;

-- Gemini's generateContent API accepts inline audio. Preserve the existing
-- working voice setup while arbitrary/OpenAI-compatible services require an
-- explicit capability opt-in in the add/edit form.
UPDATE public.ai_service_settings
SET supports_audio_input = TRUE
WHERE service_type = 'google'
  AND model_name ILIKE 'gemini-%';

COMMENT ON COLUMN public.ai_service_settings.supports_audio_input IS
  'User/admin assertion that this configured model accepts audio input for voice transcription.';

COMMIT;

-- Validate foreign key constraint in a separate transaction to avoid
-- holding write-blocking locks during the table scan.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_preferences_active_voice_ai_service_id_fkey'
      AND NOT convalidated
  ) THEN
    ALTER TABLE public.user_preferences
      VALIDATE CONSTRAINT user_preferences_active_voice_ai_service_id_fkey;
  END IF;
END $$;

COMMIT;
