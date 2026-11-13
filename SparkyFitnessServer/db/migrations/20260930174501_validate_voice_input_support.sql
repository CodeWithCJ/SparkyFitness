-- Validate the foreign key added as NOT VALID by
-- 20260930174500_add_voice_input_support.sql. A separate file so the scan does
-- not hold that file's write-blocking lock.
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
