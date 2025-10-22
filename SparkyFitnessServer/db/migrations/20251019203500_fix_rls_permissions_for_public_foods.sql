-- Migration to fix RLS policies for food_variants and food_entries to correctly handle public foods

BEGIN;

-- Drop the existing restrictive policy on food_variants
DROP POLICY IF EXISTS food_variants_rls ON public.food_variants;

-- Create a new policy that allows access to variants if the user can see the parent food
CREATE POLICY food_variants_rls ON public.food_variants
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = food_variants.food_id
    )
);

-- Drop the existing restrictive policy on food_entries
DROP POLICY IF EXISTS food_entries_update_delete_policy ON public.food_entries;

-- Create a new policy that allows users to delete their own food entries,
-- or allows family members with 'can_manage_diary' permission to delete entries.
CREATE POLICY food_entries_update_delete_policy ON public.food_entries
FOR ALL
USING (
    user_id = current_setting('app.user_id')::uuid
    OR
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.food_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

COMMIT;