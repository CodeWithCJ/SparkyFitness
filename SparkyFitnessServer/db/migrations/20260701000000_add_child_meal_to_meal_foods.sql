-- Meal-to-meal composition: allow a meal_foods row to reference either a food
-- OR another meal (a reusable sub-meal), keeping the ingredient list flat.
-- See MEAL_COMPOSITION_PLAN.md.
--
-- A meal_foods row is now polymorphic, discriminated by item_type:
--   item_type = 'food' -> food_id set,        child_meal_id null (existing rows)
--   item_type = 'meal' -> child_meal_id set,  food_id null
-- Cycle prevention and max-depth are enforced in the service layer; the DB
-- CHECK only guarantees the exactly-one-of shape.

ALTER TABLE public.meal_foods
    ALTER COLUMN food_id DROP NOT NULL;

ALTER TABLE public.meal_foods
    ADD COLUMN child_meal_id uuid,
    ADD COLUMN item_type character varying(50) NOT NULL DEFAULT 'food';

ALTER TABLE public.meal_foods
    ADD CONSTRAINT meal_foods_child_meal_id_fkey
    FOREIGN KEY (child_meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;

ALTER TABLE public.meal_foods
    ADD CONSTRAINT chk_meal_foods_item_type CHECK (
        (
            (item_type)::text = 'food'::text
            AND food_id IS NOT NULL
            AND child_meal_id IS NULL
        )
        OR (
            (item_type)::text = 'meal'::text
            AND child_meal_id IS NOT NULL
            AND food_id IS NULL
        )
    );

CREATE INDEX idx_meal_foods_child_meal_id
    ON public.meal_foods (child_meal_id);
