-- RLS select policy for family_access table.
-- This policy ensures that the `sparky_app` role can read family_access records for RLS evaluation in other tables.
-- Users can only directly see family_access records where they are the owner_user_id.
-- Family members will still inherit access to shared items via other RLS policies that check family_access.

DROP POLICY IF EXISTS family_access_select_policy ON public.family_access;
CREATE POLICY family_access_select_policy ON public.family_access
FOR SELECT
TO PUBLIC -- Ensure the app role can still read for subqueries in other RLS policies
USING (
    owner_user_id = current_setting('app.user_id')::uuid
    OR
    family_user_id = current_setting('app.user_id')::uuid
);

-- Policy for external_data_providers table (SELECT)
DROP POLICY IF EXISTS external_data_providers_select_policy ON public.external_data_providers;
CREATE POLICY external_data_providers_select_policy ON public.external_data_providers
FOR SELECT
TO PUBLIC
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Family members can see items if they have 'can_view_food_library' or 'can_view_exercise_library' permission,
    --    but NOT for Garmin provider types.
    (
        provider_type != 'garmin'
        AND
        EXISTS (
            SELECT 1 FROM public.family_access fa
            WHERE fa.owner_user_id = public.external_data_providers.user_id
              AND fa.family_user_id = current_setting('app.user_id')::uuid
              AND fa.is_active = TRUE
              AND (
                    (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                    OR
                    (fa.access_permissions->>'can_view_exercise_library')::boolean = TRUE
                  )
        )
    )
);

-- Policy for external_data_providers table (INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS external_data_providers_modify_policy ON public.external_data_providers;
CREATE POLICY external_data_providers_modify_policy ON public.external_data_providers
FOR ALL
TO PUBLIC
USING (user_id = current_setting('app.user_id')::uuid)
WITH CHECK (user_id = current_setting('app.user_id')::uuid);

-- Policy for family_access table (INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS family_access_modify_policy ON public.family_access;
CREATE POLICY family_access_modify_policy ON public.family_access
FOR ALL
TO PUBLIC
USING (owner_user_id = current_setting('app.user_id')::uuid)
WITH CHECK (owner_user_id = current_setting('app.user_id')::uuid);