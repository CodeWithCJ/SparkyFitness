-- File: rls_policies.sql
-- =============================================================================
-- THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR ALL RLS POLICIES IN THE APPLICATION.
-- It is executed on every server startup after migrations to ensure a consistent security state.
-- This script is generated from the db_schema_backup.sql to ensure all custom policies are included.
-- =============================================================================

-- Step 1: Purge all existing RLS policies from the public schema in a single operation.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT * FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.schemaname) || '.' || quote_ident(pol.tablename);
  END LOOP;
END $$;

-- Step 2: Enable RLS on all relevant tables to ensure consistent security state.
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'ai_service_settings',
    'check_in_measurements',
    'check_in_photos',
    'custom_categories',
    'custom_measurements',
    'exercise_entries',
    'exercise_entry_sets',
    'exercise_entry_activity_details',
    'exercises',
    'exercise_preset_entries',
    'external_data_providers',
    'family_access',
    'food_entries',
    'food_entry_meals',
    'food_variants',
    'foods',
    'goal_presets',
    'meal_foods',
    'meal_plan_template_assignments',
    'meal_plan_templates',
    'meal_plans',
    'meals',
    'meal_types',
    'mood_entries',
    'onboarding_data',
    'onboarding_status',
    'profiles',
    'sparky_chat_history',
    'admin_activity_logs',
    'api_key',
    'user_goals',
    'user_ignored_updates',
    'user_meal_visibilities',
    'user_nutrient_display_preferences',
    'user_oidc_links',
    'user_preferences',
    'user_water_containers',
    'water_intake',
    'water_intake_entries',
    'weekly_goal_plans',
    'workout_plan_assignment_sets',
    'workout_plan_template_assignments',
    'workout_plan_templates',
    'workout_preset_exercise_sets',
    'workout_preset_exercises',
    'workout_presets',
    'sleep_entries',
    'sleep_entry_stages',
    'fasting_logs',
    'user_custom_nutrients',
    'user_allergen_preferences',
    'user_dashboard_layouts',
    'sleep_need_calculations',
    'daily_sleep_need',
    'day_classification_cache',
    'medications',
    'medication_schedules',
    'medication_entries',
    'medication_pens',
    'injection_entries',
    'medication_titration_steps',
    'user_custom_symptoms',
    'symptom_entries',
    'user_medication_display_preferences',
    'user_custom_symptom_locations'
  ]::text[])
  LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(table_name) || ' ENABLE ROW LEVEL SECURITY;';
  END LOOP;
END $$;

-- Step 3: Define reusable helper functions for common RLS conditions.
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION authenticated_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(current_setting('app.authenticated_user_id', true), '')::uuid;
$function$;


 CREATE OR REPLACE FUNCTION public.get_accessible_users(p_user_id UUID)
    RETURNS TABLE(
        user_id UUID,
        full_name TEXT,
        email TEXT,
        permissions JSONB,
        access_end_date TIMESTAMP WITH TIME ZONE
    ) AS $func$
    BEGIN
      RETURN QUERY
      SELECT
        fa.owner_user_id,
        p.full_name,
        u.email::TEXT,
        fa.access_permissions,
        fa.access_end_date
      FROM public.family_access fa
      JOIN public.profiles p ON p.id = fa.owner_user_id
      JOIN public."user" u ON u.id = fa.owner_user_id
      WHERE fa.family_user_id = p_user_id
        AND fa.is_active = true
        AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
        AND has_any_meaningful_permission(fa.access_permissions);
    END;
    $func$ LANGUAGE plpgsql STABLE;

 CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email TEXT)
    RETURNS UUID AS $func$
    DECLARE
        v_user_id UUID;
    BEGIN
        SELECT id INTO v_user_id
        FROM public."user"
        WHERE LOWER(email) = LOWER(p_email)
        LIMIT 1;

        RETURN v_user_id;
    END;
    $func$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_family_access(owner_uuid uuid, perm text) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (fa.access_permissions ->> perm)::boolean = true
  );
$function$;

CREATE OR REPLACE FUNCTION has_family_access_or(owner_uuid uuid, perms text[]) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND EXISTS (
      SELECT 1 FROM unnest(perms) p
      WHERE (fa.access_permissions ->> p)::boolean = true
    )
  );
$function$;

CREATE OR REPLACE FUNCTION has_diary_access(owner_uuid uuid) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (fa.access_permissions->>'can_manage_diary')::boolean = true
  );
$function$;

-- Centralized helper: returns true if the given permissions JSONB contains
-- at least one meaningful delegation permission. Used by has_profile_read_access
-- and get_accessible_users to avoid duplicating the permission key list.
CREATE OR REPLACE FUNCTION has_any_meaningful_permission(perms jsonb) RETURNS bool
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT (
    (perms->>'can_manage_diary')::boolean = true OR
    (perms->>'can_manage_checkin')::boolean = true OR
    (perms->>'can_view_reports')::boolean = true OR
    (perms->>'can_manage_medications')::boolean = true
  );
$function$;

CREATE OR REPLACE FUNCTION has_profile_read_access(owner_uuid uuid) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  -- Owner always has access. Family delegates require at least one meaningful permission
  -- (diary, checkin, medications, or reports) to read profile/layout/onboarding data.
  -- A bare family_access row with no permissions does not grant read access.
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND has_any_meaningful_permission(fa.access_permissions)
  );
$function$;

CREATE OR REPLACE FUNCTION has_diary_read_access(owner_uuid uuid) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (
      (fa.access_permissions->>'can_manage_diary')::boolean = true OR
      (fa.access_permissions->>'can_view_reports')::boolean = true
    )
  );
$function$;

CREATE OR REPLACE FUNCTION has_checkin_read_access(owner_uuid uuid) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (
      (fa.access_permissions->>'can_manage_checkin')::boolean = true OR
      (fa.access_permissions->>'can_view_reports')::boolean = true
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_medication_access(owner_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (fa.access_permissions->>'can_manage_medications')::boolean = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_medication_read_access(owner_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT authenticated_user_id() = owner_uuid OR EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = authenticated_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (
      (fa.access_permissions->>'can_manage_medications')::boolean = true OR
      (fa.access_permissions->>'can_view_reports')::boolean = true
    )
  );
$$;

CREATE OR REPLACE FUNCTION has_library_access_with_public(owner_uuid uuid, is_shared bool, perms text[]) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT authenticated_user_id() = owner_uuid 
      OR is_shared 
      OR EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = owner_uuid
        AND fa.family_user_id = authenticated_user_id()
        AND fa.is_active = true
        AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
        AND (
          (fa.access_permissions->>'can_view_reports')::boolean = true OR
          EXISTS (
            SELECT 1 FROM unnest(perms) p
            WHERE (fa.access_permissions ->> p)::boolean = true
            AND (
              p <> 'can_manage_diary'
              OR current_user_id() = owner_uuid
            )
          )
        )
      );
$function$;

DROP FUNCTION IF EXISTS public.set_app_context(UUID, UUID);
CREATE OR REPLACE FUNCTION public.set_app_context(p_user_id UUID, p_authenticated_user_id UUID)
RETURNS void AS $$
BEGIN
  -- app.user_id is used by RLS to determine whose data is being accessed
  PERFORM set_config('app.user_id', p_user_id::text, false);
  
  -- app.authenticated_user_id is the actual logged-in user
  PERFORM set_config('app.authenticated_user_id', p_authenticated_user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.can_access_user_data(UUID, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.can_access_user_data(
    target_user_id UUID,
    permission_type TEXT,
    auth_user_id UUID
) RETURNS BOOLEAN AS $func$
BEGIN
  -- Self access
  IF target_user_id = auth_user_id THEN
    RETURN TRUE;
  END IF;

  -- Family access check
  RETURN EXISTS (
    SELECT 1
    FROM public.family_access fa
    WHERE fa.family_user_id = auth_user_id
      AND fa.owner_user_id = target_user_id
      AND fa.is_active = TRUE
      AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
      AND (
        (fa.access_permissions->>permission_type)::BOOLEAN = TRUE
        OR
        -- Mapping for common permission names
        (permission_type = 'diary' AND (fa.access_permissions->>'can_manage_diary')::BOOLEAN = TRUE)
        OR
        (permission_type = 'checkin' AND (fa.access_permissions->>'can_manage_checkin')::BOOLEAN = TRUE)
        OR
        (permission_type = 'reports' AND (fa.access_permissions->>'can_view_reports')::BOOLEAN = TRUE)
        OR
        -- Inheritance: reports permission grants read access to others
        (permission_type IN ('calorie', 'diary', 'mood', 'sleep', 'exercise', 'water', 'checkin')
         AND (COALESCE((fa.access_permissions->>'reports')::BOOLEAN, FALSE)
              OR COALESCE((fa.access_permissions->>'can_view_reports')::BOOLEAN, FALSE)))
      )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

-- Helper function to check if authenticated user is admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.id = authenticated_user_id()
    AND u.role = 'admin'
  );
$function$;

-- Step 4: Define generic policy creation functions.
CREATE OR REPLACE FUNCTION create_owner_policy(table_name text, id_column text DEFAULT 'user_id') RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS owner_select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS owner_modify_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS modify_policy ON public.%I;', table_name);

  EXECUTE format('
    CREATE POLICY owner_policy ON public.%I FOR ALL TO PUBLIC
    USING (%I = authenticated_user_id())
    WITH CHECK (%I = authenticated_user_id());
  ', table_name, id_column, id_column);
END;
$_$;

CREATE OR REPLACE FUNCTION create_shared_owner_policy(table_name text, id_column text DEFAULT 'user_id') RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS owner_select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS owner_modify_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS modify_policy ON public.%I;', table_name);

  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (%I = current_user_id());
  ', table_name, id_column);

  EXECUTE format('
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (%I = authenticated_user_id())
    WITH CHECK (%I = authenticated_user_id());
  ', table_name, id_column, id_column);
END;
$_$;

CREATE OR REPLACE FUNCTION create_diary_policy(table_name text) RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS modify_policy ON public.%I;', table_name);

  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_diary_read_access(user_id));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (has_diary_access(user_id))
    WITH CHECK (has_diary_access(user_id));
  ', table_name, table_name);
END;
$_$;

CREATE OR REPLACE FUNCTION create_checkin_policy(table_name text) RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS modify_policy ON public.%I;', table_name);

  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_checkin_read_access(user_id));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (authenticated_user_id() = user_id OR has_family_access(user_id, ''can_manage_checkin''))
    WITH CHECK (authenticated_user_id() = user_id OR has_family_access(user_id, ''can_manage_checkin''));
  ', table_name, table_name);
END;
$_$;

CREATE OR REPLACE FUNCTION create_library_policy(table_name text, shared_column text, permissions text[]) RETURNS void
LANGUAGE plpgsql
AS $_$
DECLARE
  quoted_permissions text;
  shared_expression text;
BEGIN
  -- Quote each permission name to ensure valid ARRAY syntax
  SELECT array_to_string(ARRAY(
    SELECT quote_literal(p) FROM unnest(permissions) p
  ), ',') INTO quoted_permissions;

  -- Use boolean false if shared_column is 'false', otherwise treat as column name
  IF shared_column = 'false' THEN
    shared_expression := 'false';
  ELSE
    shared_expression := quote_ident(shared_column);
  END IF;
  
  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_library_access_with_public(user_id, %s, ARRAY[%s]));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (authenticated_user_id() = user_id)
    WITH CHECK (authenticated_user_id() = user_id);
  ', table_name, shared_expression, quoted_permissions, table_name);
END;
$_$;

CREATE OR REPLACE FUNCTION public.create_medication_policy(table_name text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS select_policy ON public.%I;', table_name);
  EXECUTE format('DROP POLICY IF EXISTS modify_policy ON public.%I;', table_name);

  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_medication_read_access(user_id));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (has_medication_access(user_id))
    WITH CHECK (has_medication_access(user_id));
  ', table_name, table_name);
END;
$$;

-- Step 5: Apply policies to all tables.
-- Custom policy for ai_service_settings to support admin-global + user-owned settings
-- Drop ALL possible old policy names before recreating
DROP POLICY IF EXISTS owner_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS select_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS modify_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS ai_service_settings_select_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS ai_service_settings_insert_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS ai_service_settings_update_policy ON public.ai_service_settings;
DROP POLICY IF EXISTS ai_service_settings_delete_policy ON public.ai_service_settings;
-- SELECT policy: All authenticated users can read public settings, users can read their own
CREATE POLICY ai_service_settings_select_policy ON public.ai_service_settings FOR SELECT TO PUBLIC
USING (
  (is_public = TRUE AND authenticated_user_id() IS NOT NULL) OR 
  (is_public = FALSE AND user_id = authenticated_user_id())
);
-- INSERT policy: Users can create their own settings, admins can create public settings
CREATE POLICY ai_service_settings_insert_policy ON public.ai_service_settings FOR INSERT TO PUBLIC
WITH CHECK (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);
-- UPDATE policy: Users can update their own settings, admins can update public settings
CREATE POLICY ai_service_settings_update_policy ON public.ai_service_settings FOR UPDATE TO PUBLIC
USING (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
)
WITH CHECK (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);
-- DELETE policy: Users can delete their own settings, admins can delete public settings
CREATE POLICY ai_service_settings_delete_policy ON public.ai_service_settings FOR DELETE TO PUBLIC
USING (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);

-- Owner-only access tables
-- Tier 1: Strictly Private (no delegation allowed)
SELECT create_owner_policy('api_key', 'reference_id');
SELECT create_owner_policy('user_oidc_links');
SELECT create_owner_policy('sparky_chat_history');

-- Profiles: delegates can read (with any meaningful permission) but only owner can write.
-- Delegates do not need to modify another user's profile to manage their diary.
CREATE POLICY select_policy ON public.profiles FOR SELECT TO PUBLIC USING (has_profile_read_access(id));
CREATE POLICY modify_policy ON public.profiles FOR ALL TO PUBLIC USING (authenticated_user_id() = id) WITH CHECK (authenticated_user_id() = id);

CREATE POLICY select_policy ON public.user_preferences FOR SELECT TO PUBLIC USING (has_profile_read_access(user_id));
CREATE POLICY modify_policy ON public.user_preferences FOR ALL TO PUBLIC
USING (authenticated_user_id() = user_id)
WITH CHECK (authenticated_user_id() = user_id);

SELECT create_diary_policy('user_goals');
SELECT create_diary_policy('weekly_goal_plans');
SELECT create_diary_policy('user_water_containers');
SELECT create_diary_policy('user_custom_nutrients');
SELECT create_diary_policy('user_allergen_preferences');

-- Nutrient display preferences: delegates can read but only owner can rearrange their own columns.
CREATE POLICY select_policy ON public.user_nutrient_display_preferences FOR SELECT TO PUBLIC USING (has_profile_read_access(user_id));
CREATE POLICY modify_policy ON public.user_nutrient_display_preferences FOR ALL TO PUBLIC
USING (authenticated_user_id() = user_id)
WITH CHECK (authenticated_user_id() = user_id);

-- Dashboard layouts: delegates can read but only owner can rearrange their own dashboard.
CREATE POLICY select_policy ON public.user_dashboard_layouts FOR SELECT TO PUBLIC USING (has_profile_read_access(user_id));
CREATE POLICY modify_policy ON public.user_dashboard_layouts FOR ALL TO PUBLIC
USING (authenticated_user_id() = user_id)
WITH CHECK (authenticated_user_id() = user_id);
SELECT create_diary_policy('goal_presets');
SELECT create_diary_policy('meal_plans');
SELECT create_checkin_policy('mood_entries');

-- Admin Activity Logs: Only the admin who performed the action or other admins can view
CREATE POLICY admin_only_select ON public.admin_activity_logs FOR SELECT TO PUBLIC
USING (admin_user_id = current_user_id() OR is_admin());
CREATE POLICY admin_only_insert ON public.admin_activity_logs FOR INSERT TO PUBLIC
WITH CHECK (admin_user_id = current_user_id() AND is_admin());

-- Diary access tables
SELECT create_checkin_policy('check_in_measurements');
SELECT create_checkin_policy('check_in_photos');
-- Custom categories/measurements are surfaced through the check-in feature and
-- every /measurements route is guarded by checkPermissionMiddleware('checkin'),
-- so their RLS must use the check-in policy. The previous diary policy required
-- can_manage_diary to write, which blocked check-in delegates (e.g. the GLP-1
-- daily check-in) from saving even though the route allowed them.
SELECT create_checkin_policy('custom_categories');
SELECT create_checkin_policy('custom_measurements');
SELECT create_diary_policy('exercise_entries');
-- Custom policy for exercise_entries to allow access if linked to an owned exercise_preset_entry
CREATE POLICY select_exercise_preset_entry_linked_policy ON public.exercise_entries FOR SELECT TO PUBLIC
USING (
  exercise_preset_entry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.exercise_preset_entries epe
    WHERE epe.id = exercise_entries.exercise_preset_entry_id AND has_diary_read_access(epe.user_id)
  )
);
-- The modify policy for exercise_entries is already handled by create_diary_policy('exercise_entries')

SELECT create_diary_policy('exercise_preset_entries');
SELECT create_diary_policy('food_entry_meals');
SELECT create_checkin_policy('sleep_entries');
SELECT create_checkin_policy('sleep_entry_stages');
SELECT create_diary_policy('water_intake');
SELECT create_diary_policy('water_intake_entries');

-- Library access tables
SELECT create_library_policy('exercises', 'shared_with_public', ARRAY['can_view_exercise_library', 'can_manage_diary']);
SELECT create_library_policy('foods', 'shared_with_public', ARRAY['can_view_food_library', 'can_manage_diary']);
SELECT create_library_policy('meals', 'is_public', ARRAY['can_view_food_library', 'can_manage_diary']);
SELECT create_library_policy('meal_plan_templates', 'false', ARRAY['can_view_food_library']);
SELECT create_library_policy('workout_plan_templates', 'false', ARRAY['can_view_exercise_library']);
SELECT create_library_policy('workout_presets', 'is_public', ARRAY['can_view_exercise_library','can_manage_diary']);

-- Medication & GLP-1 tracker (see migration 20260624000000_add_medication_glp1_schema.sql).
-- These tables are managed by create_medication_policy at the bottom of this file (Tier 3).
-- Do NOT apply create_library_policy or create_diary_policy to medication tables.
SELECT create_owner_policy('user_medication_display_preferences');


-- Custom policies for special cases
CREATE POLICY select_policy ON public.exercise_entry_sets FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_read_access(ee.user_id)));
CREATE POLICY modify_policy ON public.exercise_entry_sets FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_access(ee.user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_access(ee.user_id)));

-- Provider configs: admin-global (is_public) OR own OR family delegation
-- Drop any old policy names first (idempotent)
DROP POLICY IF EXISTS select_policy ON public.external_data_providers;
DROP POLICY IF EXISTS modify_policy ON public.external_data_providers;
DROP POLICY IF EXISTS insert_policy ON public.external_data_providers;
DROP POLICY IF EXISTS update_policy ON public.external_data_providers;
DROP POLICY IF EXISTS delete_policy ON public.external_data_providers;

-- SELECT: admin-global (authenticated users), own, or explicit family delegation
CREATE POLICY select_policy ON public.external_data_providers FOR SELECT TO PUBLIC
USING (
  -- Admin-created global providers: all authenticated users can see them if active
  (is_public = TRUE AND is_active = TRUE AND authenticated_user_id() IS NOT NULL)
  -- Owner always sees their own providers
  OR (is_public = FALSE AND current_user_id() = user_id)
  OR (
    -- Explicit family delegation: share_external_providers permission, non-strictly-private only, must be active
    is_public = FALSE AND is_active = TRUE AND has_family_access(user_id, 'share_external_providers') AND EXISTS (
      SELECT 1 FROM public.external_provider_types ept
      WHERE ept.id = external_data_providers.provider_type
      AND ept.is_strictly_private = FALSE
    )
  )
);

-- INSERT: users create their own (is_public=FALSE), admins create global (is_public=TRUE)
CREATE POLICY insert_policy ON public.external_data_providers FOR INSERT TO PUBLIC
WITH CHECK (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);

-- UPDATE: users update own, admins update global
CREATE POLICY update_policy ON public.external_data_providers FOR UPDATE TO PUBLIC
USING (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
)
WITH CHECK (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);

-- DELETE: users delete own, admins delete global
CREATE POLICY delete_policy ON public.external_data_providers FOR DELETE TO PUBLIC
USING (
  (is_public = FALSE AND user_id = authenticated_user_id()) OR
  (is_public = TRUE AND is_admin())
);


CREATE POLICY select_policy ON public.family_access FOR SELECT TO PUBLIC
USING (authenticated_user_id() = owner_user_id OR authenticated_user_id() = family_user_id);
CREATE POLICY insert_policy ON public.family_access FOR INSERT TO PUBLIC
WITH CHECK (authenticated_user_id() = owner_user_id);
CREATE POLICY modify_policy ON public.family_access FOR ALL TO PUBLIC
USING (authenticated_user_id() = owner_user_id)
WITH CHECK (authenticated_user_id() = owner_user_id);

CREATE POLICY select_policy ON public.food_entries FOR SELECT TO PUBLIC
USING (has_diary_read_access(user_id));
CREATE POLICY insert_policy ON public.food_entries FOR INSERT TO PUBLIC
WITH CHECK (
  has_diary_access(user_id) AND (
    (food_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_entries.food_id)) OR
    (meal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = food_entries.meal_id))
  )
);
CREATE POLICY update_policy ON public.food_entries FOR UPDATE TO PUBLIC
USING (has_diary_access(user_id))
WITH CHECK (has_diary_access(user_id));
CREATE POLICY delete_policy ON public.food_entries FOR DELETE TO PUBLIC
USING (has_diary_access(user_id));

CREATE POLICY select_policy ON public.food_variants FOR SELECT TO PUBLIC
USING (
  EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND has_library_access_with_public(f.user_id, f.shared_with_public, ARRAY['can_view_food_library', 'can_manage_diary'])
  )
);
-- Food variants are library data: only the owner of the parent food may write
-- them. Delegates (even can_manage_diary) get read-only access via select_policy
-- so they can pick serving sizes while logging, but cannot mutate the library.
CREATE POLICY modify_policy ON public.food_variants FOR ALL TO PUBLIC
USING (
  EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND authenticated_user_id() = f.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND authenticated_user_id() = f.user_id
  )
);

CREATE POLICY select_policy ON public.meal_foods FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND has_library_access_with_public(m.user_id, m.is_public, ARRAY['can_view_food_library', 'can_manage_diary'])));
CREATE POLICY modify_policy ON public.meal_foods FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND authenticated_user_id() = m.user_id AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_foods.food_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND authenticated_user_id() = m.user_id AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_foods.food_id)));

CREATE POLICY owner_policy ON public.meal_plan_template_assignments FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meal_plan_templates mpt WHERE mpt.id = meal_plan_template_assignments.template_id AND has_diary_access(mpt.user_id)) AND
       (((item_type = 'food') AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id)) OR
        ((item_type = 'meal') AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))))
WITH CHECK (EXISTS (SELECT 1 FROM public.meal_plan_templates mpt WHERE mpt.id = meal_plan_template_assignments.template_id AND has_diary_access(mpt.user_id)) AND
           (((item_type = 'food') AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id)) OR
            ((item_type = 'meal') AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))));

CREATE POLICY owner_policy ON public.workout_plan_assignment_sets FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_plan_template_assignments wpta WHERE wpta.id = workout_plan_assignment_sets.assignment_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plan_template_assignments wpta WHERE wpta.id = workout_plan_assignment_sets.assignment_id));

CREATE POLICY owner_policy ON public.workout_plan_template_assignments FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_plan_templates wpt WHERE wpt.id = workout_plan_template_assignments.template_id AND has_diary_access(wpt.user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plan_templates wpt WHERE wpt.id = workout_plan_template_assignments.template_id AND has_diary_access(wpt.user_id)));

CREATE POLICY select_policy ON public.workout_preset_exercise_sets FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_preset_exercises wpe WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id));
CREATE POLICY modify_policy ON public.workout_preset_exercise_sets FOR ALL TO PUBLIC
USING (EXISTS (
  SELECT 1 FROM public.workout_preset_exercises wpe
  JOIN public.workout_presets wp ON wp.id = wpe.workout_preset_id
  WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id
    AND authenticated_user_id() = wp.user_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workout_preset_exercises wpe
  JOIN public.workout_presets wp ON wp.id = wpe.workout_preset_id
  WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id
    AND authenticated_user_id() = wp.user_id
));

CREATE POLICY select_policy ON public.workout_preset_exercises FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_presets wp WHERE wp.id = workout_preset_exercises.workout_preset_id));
CREATE POLICY modify_policy ON public.workout_preset_exercises FOR ALL TO PUBLIC
USING (EXISTS (
  SELECT 1 FROM public.workout_presets wp
  WHERE wp.id = workout_preset_exercises.workout_preset_id
    AND authenticated_user_id() = wp.user_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workout_presets wp
  WHERE wp.id = workout_preset_exercises.workout_preset_id
    AND authenticated_user_id() = wp.user_id
));

-- Strictly Private (Tier 1)
SELECT create_owner_policy('user_ignored_updates');

-- Meal types: access if user_id is null (system) or if user has diary access
CREATE POLICY select_policy ON public.meal_types FOR SELECT TO PUBLIC
USING (user_id IS NULL OR has_diary_read_access(user_id));
CREATE POLICY modify_policy ON public.meal_types FOR ALL TO PUBLIC
USING (user_id = authenticated_user_id())
WITH CHECK (user_id = authenticated_user_id());

-- Activity details: access if linked exercise entry or preset entry is accessible
CREATE POLICY select_policy ON public.exercise_entry_activity_details FOR SELECT TO PUBLIC
USING (
  (exercise_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_id AND has_diary_read_access(ee.user_id))) OR
  (exercise_preset_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_preset_entries epe WHERE epe.id = exercise_preset_entry_id AND has_diary_read_access(epe.user_id)))
);
CREATE POLICY modify_policy ON public.exercise_entry_activity_details FOR ALL TO PUBLIC
USING (
  (exercise_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_id AND has_diary_access(ee.user_id))) OR
  (exercise_preset_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_preset_entries epe WHERE epe.id = exercise_preset_entry_id AND has_diary_access(epe.user_id)))
)
WITH CHECK (
  (exercise_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_id AND has_diary_access(ee.user_id))) OR
  (exercise_preset_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.exercise_preset_entries epe WHERE epe.id = exercise_preset_entry_id AND has_diary_access(epe.user_id)))
);

-- Shared View-Only (Tier 2)
SELECT create_checkin_policy('fasting_logs');
SELECT create_diary_policy('user_meal_visibilities');
SELECT create_checkin_policy('sleep_need_calculations');
SELECT create_checkin_policy('daily_sleep_need');
-- Day classification is a sleep/wellness (check-in) feature, used only by the
-- sleep-science service. It must use the check-in policy so check-in delegates
-- can manage it; the previous diary policy was a misclassification.
SELECT create_checkin_policy('day_classification_cache');
-- Onboarding data/status: delegates can read (to avoid repeated onboarding prompts when viewing
-- another user's diary) but only the account owner can submit or reset their own onboarding.
CREATE POLICY select_policy ON public.onboarding_data FOR SELECT TO PUBLIC USING (has_profile_read_access(user_id));
CREATE POLICY modify_policy ON public.onboarding_data FOR ALL TO PUBLIC
USING (authenticated_user_id() = user_id)
WITH CHECK (authenticated_user_id() = user_id);

CREATE POLICY select_policy ON public.onboarding_status FOR SELECT TO PUBLIC USING (has_profile_read_access(user_id));
CREATE POLICY modify_policy ON public.onboarding_status FOR ALL TO PUBLIC
USING (authenticated_user_id() = user_id)
WITH CHECK (authenticated_user_id() = user_id);

-- Medications & Symptoms (Tier 3 - Delegate Writable with medications permission)
SELECT create_medication_policy('medications');
SELECT create_medication_policy('medication_schedules');
SELECT create_medication_policy('medication_entries');
SELECT create_medication_policy('medication_pens');
SELECT create_medication_policy('injection_entries');
SELECT create_medication_policy('medication_titration_steps');
SELECT create_medication_policy('user_custom_symptoms');
SELECT create_medication_policy('symptom_entries');
SELECT create_medication_policy('user_custom_symptom_locations');

-- Medications Display Preferences (Tier 2 - Owner-Only Write, Delegate Read)
CREATE POLICY select_policy ON public.user_medication_display_preferences FOR SELECT TO PUBLIC USING (has_medication_read_access(user_id));
CREATE POLICY modify_policy ON public.user_medication_display_preferences FOR ALL TO PUBLIC USING (authenticated_user_id() = user_id) WITH CHECK (authenticated_user_id() = user_id);
