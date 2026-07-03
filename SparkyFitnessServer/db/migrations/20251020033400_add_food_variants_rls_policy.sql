-- Policy for food_variants table
DROP POLICY IF EXISTS food_variants_select_policy ON public.food_variants;
CREATE POLICY food_variants_select_policy ON public.food_variants
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.food_variants.food_id
          AND (
            -- 1. Owner can always see their own items
            f.user_id = current_setting('app.user_id')::uuid
            OR
            -- 2. Publicly shared items are visible to everyone
            f.shared_with_public = TRUE
            OR
            -- 3. Friends can see items if they have 'can_view_food_library' permission
            EXISTS (
                SELECT 1 FROM public.family_access fa
                WHERE fa.family_user_id = f.user_id
                  AND fa.owner_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
            )
            OR
            -- 4. Diary managers can see items belonging to the user whose diary they are managing
            EXISTS (
                SELECT 1 FROM public.family_access fa
                WHERE fa.family_user_id = f.user_id
                  AND fa.owner_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
            )
          )
    )
);

-- Policy for food_variants table (Owner has full CRUD access to their own items)
DROP POLICY IF EXISTS food_variants_all_policy ON public.food_variants;
CREATE POLICY food_variants_all_policy ON public.food_variants
FOR ALL
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.food_variants.food_id
          AND f.user_id = current_setting('app.user_id')::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.food_variants.food_id
          AND f.user_id = current_setting('app.user_id')::uuid
    )
);