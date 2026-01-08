BEGIN;

ALTER TABLE public.check_in_measurements
DROP CONSTRAINT IF EXISTS check_in_measurements_created_by_user_id_fkey,
ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey
FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;