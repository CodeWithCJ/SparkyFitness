-- Drop the existing restrictive policy on meals
DROP POLICY IF EXISTS meals_all_policy ON public.meals;

-- Policy for meals table
DROP POLICY IF EXISTS meals_select_policy ON public.meals;
CREATE POLICY meals_select_policy ON public.meals
FOR SELECT
TO PUBLIC
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared items are visible to everyone
    is_public = TRUE
    OR
    -- 3. Friends can see items if they have 'can_view_food_library' permission
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.family_user_id = meals.user_id
          AND fa.owner_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
    )
    OR
    -- 4. Diary managers can see items belonging to the user whose diary they are managing
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.family_user_id = meals.user_id
          AND fa.owner_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for meals table (Owner has full CRUD access to their own items)
DROP POLICY IF EXISTS meals_all_owner_policy ON public.meals;
CREATE POLICY meals_all_owner_policy ON public.meals
FOR ALL
TO PUBLIC
USING (user_id = current_setting('app.user_id')::uuid)
WITH CHECK (user_id = current_setting('app.user_id')::uuid);