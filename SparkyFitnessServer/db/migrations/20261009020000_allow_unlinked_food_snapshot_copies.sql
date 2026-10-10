-- Preserve self-contained nutrition snapshots when their source library item
-- has been deleted. Diary ownership/delegation is still required; this does
-- not allow independent serving pointers to bypass source visibility checks.
DROP POLICY IF EXISTS insert_policy ON public.food_entries;
CREATE POLICY insert_policy ON public.food_entries FOR INSERT TO PUBLIC
WITH CHECK (
    has_diary_access(user_id) AND (
        (food_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_entries.food_id)) OR
        (meal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = food_entries.meal_id)) OR
        (food_id IS NULL AND meal_id IS NULL AND variant_id IS NULL)
    )
);
