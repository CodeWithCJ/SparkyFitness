-- Update external_data_providers SELECT policy to allow public-shared providers to be visible
DROP POLICY IF EXISTS external_data_providers_select_policy ON public.external_data_providers;

CREATE POLICY external_data_providers_select_policy ON public.external_data_providers
FOR SELECT
TO PUBLIC
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared providers (except garmin) are visible to everyone
    (shared_with_public = TRUE AND provider_type != 'garmin')
    OR
    -- 3. Family members can see items if they have 'can_view_food_library' or 'can_view_exercise_library' permission,
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

-- modify existing modify policy to ensure owners only can modify
DROP POLICY IF EXISTS external_data_providers_modify_policy ON public.external_data_providers;
CREATE POLICY external_data_providers_modify_policy ON public.external_data_providers
FOR ALL
TO PUBLIC
USING (user_id = current_setting('app.user_id')::uuid)
WITH CHECK (user_id = current_setting('app.user_id')::uuid);
