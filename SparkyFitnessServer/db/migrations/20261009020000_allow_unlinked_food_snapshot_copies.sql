-- Preserve self-contained nutrition snapshots when their source library item
-- has been deleted. Diary ownership/delegation is still required; this does
-- not allow independent serving pointers to bypass source visibility checks.
-- Existing installations already have the diary helper. On a fresh database,
-- canonical RLS installs that helper and this policy immediately after the
-- migrations, under the same startup lock and before the server accepts traffic.
DO $$
BEGIN
    IF to_regprocedure('public.has_diary_access(uuid)') IS NOT NULL THEN
        DROP POLICY IF EXISTS insert_policy ON public.food_entries;
        EXECUTE $policy$
            CREATE POLICY insert_policy ON public.food_entries FOR INSERT TO PUBLIC
            WITH CHECK (
                public.has_diary_access(user_id) AND (
                    (food_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_entries.food_id)) OR
                    (meal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = food_entries.meal_id)) OR
                    (food_id IS NULL AND meal_id IS NULL AND variant_id IS NULL)
                )
            )
        $policy$;
    END IF;
END;
$$;
