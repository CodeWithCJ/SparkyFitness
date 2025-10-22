-- Migration to fix the food_variants RLS policy to correctly check parent food visibility

BEGIN;

-- Drop the existing flawed policy on food_variants
DROP POLICY IF EXISTS food_variants_rls ON public.food_variants;

-- Create a new, correct policy that properly checks permissions on the parent food
CREATE POLICY food_variants_rls ON public.food_variants
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.foods f
        WHERE f.id = food_variants.food_id
        -- The user can see the variant if they can see the parent food.
        -- RLS on the `foods` table is implicitly applied here.
    )
);

-- The policy for INSERT/UPDATE/DELETE should be more restrictive,
-- usually only allowing the owner of the food to modify variants.
CREATE POLICY food_variants_modify_policy ON public.food_variants
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.foods f
        WHERE f.id = food_variants.food_id AND f.user_id = current_setting('app.user_id')::uuid
    )
);


COMMIT;