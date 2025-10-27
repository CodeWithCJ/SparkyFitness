-- Migration to fix the exercises RLS policy to correctly handle family access.

-- Drop the existing policy
DROP POLICY IF EXISTS exercises_select_policy ON public.exercises;

-- Create the updated policy with sharing logic
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