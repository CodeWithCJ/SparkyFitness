-- Corrected RLS policies for foods, food_variants, and exercises to properly handle family access.

-- Policy for foods table
DROP POLICY IF EXISTS foods_select_policy ON public.foods;
CREATE POLICY foods_select_policy ON public.foods
FOR SELECT
TO PUBLIC
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared items are visible to everyone
    shared_with_public = TRUE
    OR
    -- 3. Family members can see items if they have 'can_view_food_library' or 'can_manage_diary' permission
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.foods.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (
                (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                OR
                (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
              )
    )
);

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
            -- 3. Family members can see items if they have 'can_view_food_library' or 'can_manage_diary' permission
            EXISTS (
                SELECT 1 FROM public.family_access fa
                WHERE fa.owner_user_id = f.user_id
                  AND fa.family_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (
                        (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                        OR
                        (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
                      )
            )
          )
    )
);

-- Policy for exercises table
DROP POLICY IF EXISTS exercises_select_policy ON public.exercises;
CREATE POLICY exercises_select_policy ON public.exercises
FOR SELECT
TO PUBLIC
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared items are visible to everyone
    shared_with_public = TRUE
    OR
    -- 3. Family members can see items if they have 'can_view_exercise_library' or 'can_manage_diary' permission
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercises.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (
                (fa.access_permissions->>'can_view_exercise_library')::boolean = TRUE
                OR
                (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
              )
    )
);