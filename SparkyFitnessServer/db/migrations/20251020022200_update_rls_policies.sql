-- Drop the existing policy
DROP POLICY IF EXISTS foods_select_policy ON public.foods;

-- Create the corrected policy
CREATE POLICY foods_select_policy ON public.foods
FOR SELECT
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared items are visible to everyone
    shared_with_public = TRUE
    OR
    -- 3. Friends can see items if they have 'can_view_food_library' permission
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.family_user_id = public.foods.user_id
          AND fa.owner_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
    )
    OR
    -- 4. Diary managers can see items belonging to the user whose diary they are managing
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.family_user_id = public.foods.user_id
          AND fa.owner_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);