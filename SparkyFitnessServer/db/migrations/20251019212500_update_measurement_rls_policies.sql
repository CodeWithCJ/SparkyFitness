-- Migration to update RLS policies for measurement tables to include delegated access logic

BEGIN;

-- Drop existing generic policies for measurement tables
DROP POLICY IF EXISTS check_in_measurements_user_policy ON public.check_in_measurements;
DROP POLICY IF EXISTS custom_categories_user_policy ON public.custom_categories;
DROP POLICY IF EXISTS custom_measurements_user_policy ON public.custom_measurements;
DROP POLICY IF EXISTS water_intake_user_policy ON public.water_intake;

-- Create new RLS policies for SELECT operations on check_in_measurements
CREATE POLICY check_in_measurements_select_policy ON public.check_in_measurements
FOR SELECT
USING (
    -- Owner can always see their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see entries of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.check_in_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for ALL (INSERT, UPDATE, DELETE) operations on check_in_measurements
CREATE POLICY check_in_measurements_modify_policy ON public.check_in_measurements
FOR ALL
USING (
    -- Owner can always modify their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User with 'can_manage_diary' permission can modify the owner's entries
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.check_in_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
)
WITH CHECK (
    -- Ensure that new/updated entries also adhere to the same ownership/delegated access rules
    user_id = current_setting('app.user_id')::uuid
    OR
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.check_in_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for SELECT operations on custom_categories
CREATE POLICY custom_categories_select_policy ON public.custom_categories
FOR SELECT
USING (
    -- Owner can always see their own categories
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see categories of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_categories.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for ALL (INSERT, UPDATE, DELETE) operations on custom_categories
CREATE POLICY custom_categories_modify_policy ON public.custom_categories
FOR ALL
USING (
    -- Owner can always modify their own categories
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User with 'can_manage_diary' permission can modify the owner's categories
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_categories.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
)
WITH CHECK (
    -- Ensure that new/updated categories also adhere to the same ownership/delegated access rules
    user_id = current_setting('app.user_id')::uuid
    OR
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_categories.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for SELECT operations on custom_measurements
CREATE POLICY custom_measurements_select_policy ON public.custom_measurements
FOR SELECT
USING (
    -- Owner can always see their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see entries of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for ALL (INSERT, UPDATE, DELETE) operations on custom_measurements
CREATE POLICY custom_measurements_modify_policy ON public.custom_measurements
FOR ALL
USING (
    -- Owner can always modify their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User with 'can_manage_diary' permission can modify the owner's entries
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
)
WITH CHECK (
    -- Ensure that new/updated entries also adhere to the same ownership/delegated access rules
    user_id = current_setting('app.user_id')::uuid
    OR
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.custom_measurements.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for SELECT operations on water_intake
CREATE POLICY water_intake_select_policy ON public.water_intake
FOR SELECT
USING (
    -- Owner can always see their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see entries of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.water_intake.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Create new RLS policies for ALL (INSERT, UPDATE, DELETE) operations on water_intake
CREATE POLICY water_intake_modify_policy ON public.water_intake
FOR ALL
USING (
    -- Owner can always modify their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User with 'can_manage_diary' permission can modify the owner's entries
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.water_intake.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
)
WITH CHECK (
    -- Ensure that new/updated entries also adhere to the same ownership/delegated access rules
    user_id = current_setting('app.user_id')::uuid
    OR
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.water_intake.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

COMMIT;