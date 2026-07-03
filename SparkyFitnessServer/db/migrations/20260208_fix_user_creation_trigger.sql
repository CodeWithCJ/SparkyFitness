-- SparkyFitnessServer/db/migrations/20260208_fix_user_creation_trigger.sql

-- 1. Drop the legacy trigger on the old auth.users table if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Update the handle_new_user function to be more robust
-- It now uses ON CONFLICT for onboarding_status to prevent errors if app-level init runs first.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure onboarding_status exists (using ON CONFLICT to avoid errors if app-level init already did this)
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default external data providers
  PERFORM public.create_default_external_data_providers(new.id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger on the current public.user table
-- This table is used by Better Auth for new user registrations.
DROP TRIGGER IF EXISTS on_public_user_created ON public."user";
CREATE TRIGGER on_public_user_created
  AFTER INSERT ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add a comment for clarity
COMMENT ON TRIGGER on_public_user_created ON public."user" IS 'Initializes onboarding status and default external providers for new users created via Better Auth.';
