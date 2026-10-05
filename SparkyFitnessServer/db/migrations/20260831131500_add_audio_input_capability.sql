ALTER TABLE ai_service_settings
  ADD COLUMN IF NOT EXISTS supports_audio_input BOOLEAN NOT NULL DEFAULT FALSE;

-- Gemini's generateContent API accepts inline audio. Preserve the existing
-- working voice setup while arbitrary/OpenAI-compatible services require an
-- explicit capability opt-in in the add/edit form.
UPDATE ai_service_settings
SET supports_audio_input = TRUE
WHERE service_type = 'google'
  AND model_name ILIKE 'gemini-%';

COMMENT ON COLUMN ai_service_settings.supports_audio_input IS
  'User/admin assertion that this configured model accepts audio input for voice transcription.';
