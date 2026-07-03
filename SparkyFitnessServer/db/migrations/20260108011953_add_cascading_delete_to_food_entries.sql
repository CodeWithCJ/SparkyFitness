BEGIN;

ALTER TABLE public.food_entries
DROP CONSTRAINT IF EXISTS food_entries_updated_by_user_id_fkey,
ADD CONSTRAINT food_entries_updated_by_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;