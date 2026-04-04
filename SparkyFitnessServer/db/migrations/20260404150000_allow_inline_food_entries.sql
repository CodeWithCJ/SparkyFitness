-- Allow inline food entries (AI-generated, without food_id or meal_id)
-- Previously the RLS insert policy required either food_id OR meal_id to be set.
-- This change allows entries where both are NULL (inline nutrition from AI/Telegram bot).

DROP POLICY IF EXISTS insert_policy ON public.food_entries;

CREATE POLICY insert_policy ON public.food_entries FOR INSERT TO PUBLIC
WITH CHECK (
  has_diary_access(user_id) AND (
    (food_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_entries.food_id)) OR
    (meal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = food_entries.meal_id)) OR
    (food_id IS NULL AND meal_id IS NULL)
  )
);
