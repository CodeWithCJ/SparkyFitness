ALTER TABLE public.user_meal_visibilities
DROP CONSTRAINT IF EXISTS user_meal_visibilities_user_id_fkey;

ALTER TABLE public.user_meal_visibilities
ADD CONSTRAINT user_meal_visibilities_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
