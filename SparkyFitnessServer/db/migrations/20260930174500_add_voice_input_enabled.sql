BEGIN;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS voice_input_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.user_preferences.voice_input_enabled IS
  'Shows voice input in web and mobile chat. Disabling preserves the selected Voice configuration.';

COMMIT;
