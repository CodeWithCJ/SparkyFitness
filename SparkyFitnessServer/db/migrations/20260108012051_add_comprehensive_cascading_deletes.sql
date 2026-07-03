BEGIN;

-- Add ON DELETE CASCADE to foreign keys that should be removed when a user is deleted.
-- Add ON DELETE SET NULL to foreign keys that should be kept, but dissociated from the deleted user.

-- From previous attempt, but now including all identified missing constraints
ALTER TABLE public.check_in_measurements DROP CONSTRAINT IF EXISTS check_in_measurements_created_by_user_id_fkey, ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.check_in_measurements DROP CONSTRAINT IF EXISTS check_in_measurements_updated_by_user_id_fkey, ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.custom_categories DROP CONSTRAINT IF EXISTS custom_categories_created_by_user_id_fkey, ADD CONSTRAINT custom_categories_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.custom_categories DROP CONSTRAINT IF EXISTS custom_categories_updated_by_user_id_fkey, ADD CONSTRAINT custom_categories_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.custom_measurements DROP CONSTRAINT IF EXISTS custom_measurements_created_by_user_id_fkey, ADD CONSTRAINT custom_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.custom_measurements DROP CONSTRAINT IF EXISTS custom_measurements_updated_by_user_id_fkey, ADD CONSTRAINT custom_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS exercise_entries_updated_by_user_id_fkey, ADD CONSTRAINT exercise_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_updated_by_user_id_fkey, ADD CONSTRAINT food_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.water_intake DROP CONSTRAINT IF EXISTS water_intake_created_by_user_id_fkey, ADD CONSTRAINT water_intake_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.water_intake DROP CONSTRAINT IF EXISTS water_intake_updated_by_user_id_fkey, ADD CONSTRAINT water_intake_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- This was the original erroring constraint
ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_user_id_fkey, ADD CONSTRAINT food_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


COMMIT;