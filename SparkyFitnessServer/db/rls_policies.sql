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
BEGIN
  PERFORM 'ALTER TABLE public.' || quote_ident(table_name) || ' ENABLE ROW LEVEL SECURITY;'
  FROM unnest(ARRAY[
    'ai_service_settings',
    'check_in_measurements',
    'custom_categories',
    'custom_measurements',
    'exercise_entries',
    'exercise_entry_sets',
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
    'mood_entries',
    'profiles',
    'sparky_chat_history',
    'user_api_keys',
    'user_goals',
    'user_ignored_updates',
    'user_nutrient_display_preferences',
    'user_oidc_links',
    'user_preferences',
    'user_water_containers',
    'water_intake',
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
        'garmin_sync_jobs'
      ]::text[]) AS table_name;
    END $$;

-- Step 3: Define reusable helper functions for common RLS conditions.
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $function$
  SELECT (current_setting('app.user_id'::text))::uuid;
$function$;

CREATE OR REPLACE FUNCTION has_family_access(owner_uuid uuid, perm text) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = current_user_id()
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
    AND fa.family_user_id = current_user_id()
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
  SELECT current_user_id() = owner_uuid OR has_family_access(owner_uuid, 'can_manage_diary');
$function$;

CREATE OR REPLACE FUNCTION has_library_access_with_public(owner_uuid uuid, is_shared bool, perms text[]) RETURNS bool
LANGUAGE sql STABLE
AS $function$
  SELECT current_user_id() = owner_uuid OR is_shared OR has_family_access_or(owner_uuid, perms);
$function$;

-- Step 4: Define generic policy creation functions.
CREATE OR REPLACE FUNCTION create_owner_policy(table_name text, id_column text DEFAULT 'user_id') RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('
    CREATE POLICY owner_policy ON public.%I FOR ALL TO PUBLIC
    USING (%I = current_user_id())
    WITH CHECK (%I = current_user_id());
  ', table_name, id_column, id_column);
END;
$_$;

CREATE OR REPLACE FUNCTION create_diary_policy(table_name text) RETURNS void
LANGUAGE plpgsql
AS $_$
BEGIN
  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_diary_access(user_id));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (has_diary_access(user_id))
    WITH CHECK (has_diary_access(user_id));
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
    USING (current_user_id() = user_id)
    WITH CHECK (current_user_id() = user_id);
  ', table_name, shared_expression, quoted_permissions, table_name);
END;
$_$;

-- Step 5: Apply policies to all tables.
-- Owner-only access tables
SELECT create_owner_policy('ai_service_settings');
SELECT create_owner_policy('goal_presets');
SELECT create_owner_policy('meal_plans');
SELECT create_owner_policy('mood_entries');
SELECT create_owner_policy('profiles', 'id');
SELECT create_owner_policy('sparky_chat_history');
SELECT create_owner_policy('user_api_keys');
SELECT create_owner_policy('user_goals');
SELECT create_owner_policy('user_nutrient_display_preferences');
SELECT create_owner_policy('user_oidc_links');
SELECT create_owner_policy('user_preferences');
SELECT create_owner_policy('user_water_containers');
SELECT create_owner_policy('weekly_goal_plans');
SELECT create_owner_policy('user_custom_nutrients');

-- Diary access tables
SELECT create_diary_policy('check_in_measurements');
SELECT create_diary_policy('custom_categories');
SELECT create_diary_policy('custom_measurements');
SELECT create_diary_policy('exercise_entries');
-- Custom policy for exercise_entries to allow access if linked to an owned exercise_preset_entry
CREATE POLICY select_exercise_preset_entry_linked_policy ON public.exercise_entries FOR SELECT TO PUBLIC
USING (
  exercise_preset_entry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.exercise_preset_entries epe
    WHERE epe.id = exercise_entries.exercise_preset_entry_id AND has_diary_access(epe.user_id)
  )
);
-- The modify policy for exercise_entries is already handled by create_diary_policy('exercise_entries')

SELECT create_diary_policy('exercise_preset_entries');
SELECT create_diary_policy('food_entry_meals'); -- Add this line
SELECT create_diary_policy('sleep_entries');
SELECT create_diary_policy('sleep_entry_stages');
SELECT create_diary_policy('water_intake');

-- Library access tables
SELECT create_library_policy('exercises', 'shared_with_public', ARRAY['can_view_exercise_library', 'can_manage_diary']);
SELECT create_library_policy('foods', 'shared_with_public', ARRAY['can_view_food_library', 'can_manage_diary']);
SELECT create_library_policy('meals', 'is_public', ARRAY['can_view_food_library', 'can_manage_diary']);
SELECT create_library_policy('meal_plan_templates', 'false', ARRAY['can_view_food_library']);
SELECT create_library_policy('workout_plan_templates', 'false', ARRAY['can_view_exercise_library']);
SELECT create_library_policy('workout_presets', 'false', ARRAY['can_view_exercise_library']);


-- Custom policies for special cases
CREATE POLICY select_policy ON public.exercise_entry_sets FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_access(ee.user_id)));
CREATE POLICY modify_policy ON public.exercise_entry_sets FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_access(ee.user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.id = exercise_entry_sets.exercise_entry_id AND has_diary_access(ee.user_id)));

CREATE POLICY select_policy ON public.external_data_providers FOR SELECT TO PUBLIC
USING (current_user_id() = user_id OR (provider_type <> 'garmin' AND (shared_with_public OR has_family_access_or(user_id, ARRAY['can_view_food_library', 'can_view_exercise_library']))));
CREATE POLICY modify_policy ON public.external_data_providers FOR ALL TO PUBLIC
USING (current_user_id() = user_id)
WITH CHECK (current_user_id() = user_id);

CREATE POLICY select_policy ON public.family_access FOR SELECT TO PUBLIC
USING (current_user_id() = owner_user_id OR current_user_id() = family_user_id);
CREATE POLICY insert_policy ON public.family_access FOR INSERT TO PUBLIC
WITH CHECK (current_user_id() = owner_user_id);
CREATE POLICY modify_policy ON public.family_access FOR ALL TO PUBLIC
USING (current_user_id() = owner_user_id)
WITH CHECK (current_user_id() = owner_user_id);

CREATE POLICY select_policy ON public.food_entries FOR SELECT TO PUBLIC
USING (has_diary_access(user_id));
CREATE POLICY insert_policy ON public.food_entries FOR INSERT TO PUBLIC
WITH CHECK (has_diary_access(user_id) AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_entries.food_id));
CREATE POLICY modify_policy ON public.food_entries FOR ALL TO PUBLIC
USING (has_diary_access(user_id))
WITH CHECK (has_diary_access(user_id));

CREATE POLICY select_and_modify_policy ON public.food_variants FOR ALL TO PUBLIC
USING (
  EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND has_library_access_with_public(f.user_id, f.shared_with_public, ARRAY['can_view_food_library', 'can_manage_diary'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND has_diary_access(f.user_id)
  )
);

CREATE POLICY select_policy ON public.meal_foods FOR SELECT TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND has_library_access_with_public(m.user_id, m.is_public, ARRAY['can_view_food_library', 'can_manage_diary'])));
CREATE POLICY modify_policy ON public.meal_foods FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND current_user_id() = m.user_id AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_foods.food_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_foods.meal_id AND current_user_id() = m.user_id AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_foods.food_id)));

CREATE POLICY owner_policy ON public.meal_plan_template_assignments FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.meal_plan_templates mpt WHERE mpt.id = meal_plan_template_assignments.template_id AND current_user_id() = mpt.user_id) AND
       (((item_type = 'food') AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id)) OR
        ((item_type = 'meal') AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))))
WITH CHECK (EXISTS (SELECT 1 FROM public.meal_plan_templates mpt WHERE mpt.id = meal_plan_template_assignments.template_id AND current_user_id() = mpt.user_id) AND
           (((item_type = 'food') AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id)) OR
            ((item_type = 'meal') AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))));

CREATE POLICY owner_policy ON public.workout_plan_assignment_sets FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_plan_template_assignments wpta WHERE wpta.id = workout_plan_assignment_sets.assignment_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plan_template_assignments wpta WHERE wpta.id = workout_plan_assignment_sets.assignment_id));

CREATE POLICY owner_policy ON public.workout_plan_template_assignments FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_plan_templates wpt WHERE wpt.id = workout_plan_template_assignments.template_id AND current_user_id() = wpt.user_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plan_templates wpt WHERE wpt.id = workout_plan_template_assignments.template_id AND current_user_id() = wpt.user_id));

CREATE POLICY owner_policy ON public.workout_preset_exercise_sets FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_preset_exercises wpe WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_preset_exercises wpe WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id));

CREATE POLICY owner_policy ON public.workout_preset_exercises FOR ALL TO PUBLIC
USING (EXISTS (SELECT 1 FROM public.workout_presets wp WHERE wp.id = workout_preset_exercises.workout_preset_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.workout_presets wp WHERE wp.id = workout_preset_exercises.workout_preset_id));

SELECT create_owner_policy('user_ignored_updates');
SELECT create_owner_policy('fasting_logs');
SELECT create_owner_policy('garmin_sync_jobs');