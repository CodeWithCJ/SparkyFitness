-- Consolidated Migration for RLS Policies

-- Enable RLS on all relevant tables
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_entry_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ignored_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_water_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sparky_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_service_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_data_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sparky_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_nutrient_display_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_oidc_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_goal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plan_assignment_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plan_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_preset_exercise_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_preset_exercises ENABLE ROW LEVEL SECURITY;


-- Set session variable for authenticated user ID
CREATE OR REPLACE FUNCTION public.set_user_id(user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.user_id', user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies before creating new ones to ensure idempotency
DROP POLICY IF EXISTS foods_select_policy ON public.foods;
DROP POLICY IF EXISTS exercises_select_policy ON public.exercises;
DROP POLICY IF EXISTS meals_select_policy ON public.meals;
DROP POLICY IF EXISTS food_entries_select_policy ON public.food_entries;
DROP POLICY IF EXISTS exercise_entries_select_policy ON public.exercise_entries;
DROP POLICY IF EXISTS exercise_entry_sets_select_policy ON public.exercise_entry_sets;
DROP POLICY IF EXISTS food_entries_update_delete_policy ON public.food_entries;
DROP POLICY IF EXISTS exercise_entries_update_delete_policy ON public.exercise_entries;
DROP POLICY IF EXISTS exercise_entry_sets_update_delete_policy ON public.exercise_entry_sets;
DROP POLICY IF EXISTS food_entries_insert_policy ON public.food_entries;
DROP POLICY IF EXISTS exercise_entries_insert_policy ON public.exercise_entries;
DROP POLICY IF EXISTS exercise_entry_sets_insert_policy ON public.exercise_entry_sets;
DROP POLICY IF EXISTS user_ignored_updates_insert_policy ON public.user_ignored_updates;
DROP POLICY IF EXISTS family_access_insert_policy ON public.family_access;
DROP POLICY IF EXISTS family_access_select_policy ON public.family_access;
DROP POLICY IF EXISTS user_ignored_updates_select_policy ON public.user_ignored_updates;
DROP POLICY IF EXISTS user_ignored_updates_update_delete_policy ON public.user_ignored_updates;

-- Policy for foods table (Library items)
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
        WHERE fa.owner_user_id = public.foods.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
    )
    OR
    -- 4. Diary managers can see items belonging to the user whose diary they are managing
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.foods.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercises table (Library items)
CREATE POLICY exercises_select_policy ON public.exercises
FOR SELECT
USING (
    -- 1. Owner can always see their own items
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. Publicly shared items are visible to everyone
    shared_with_public = TRUE
    OR
    -- 3. Friends can see items if they have 'can_view_exercise_library' permission
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercises.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_exercise_library')::boolean = TRUE
    )
    OR
    -- 4. Diary managers can see items belonging to the user whose diary they are managing
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercises.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for meals table (Library items)
CREATE POLICY meals_select_policy ON public.meals
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
        WHERE fa.owner_user_id = public.meals.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
    )
    OR
    -- 4. Diary managers can see items belonging to the user whose diary they are managing
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.meals.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for food_entries table (Diary entries)
CREATE POLICY food_entries_select_policy ON public.food_entries
FOR SELECT
USING (
    -- User can always see their own diary entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see diary entries of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.food_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entries table (Diary entries)
CREATE POLICY exercise_entries_select_policy ON public.exercise_entries
FOR SELECT
USING (
    -- User can always see their own diary entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can see diary entries of another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercise_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entry_sets table (Part of a diary entry)
CREATE POLICY exercise_entry_sets_select_policy ON public.exercise_entry_sets
FOR SELECT
USING (
    -- User can see sets if they can see the parent exercise_entry
    EXISTS (
        SELECT 1
        FROM public.exercise_entries ee
        WHERE ee.id = public.exercise_entry_sets.exercise_entry_id
          AND (
            -- User can see their own sets
            ee.user_id = current_setting('app.user_id')::uuid
            OR
            -- User can see sets of another user if they have 'can_manage_diary' permission
            EXISTS (
                SELECT 1
                FROM public.family_access fa
                WHERE fa.owner_user_id = ee.user_id
                  AND fa.family_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
            )
          )
    )
);

-- Policy for family_access table (users can only see their own family access records)
CREATE POLICY family_access_select_policy ON public.family_access
FOR SELECT
USING (
    owner_user_id = current_setting('app.user_id')::uuid
    OR
    family_user_id = current_setting('app.user_id')::uuid
);

-- Policy for user_ignored_updates table (users can only see their own ignored updates)
CREATE POLICY user_ignored_updates_select_policy ON public.user_ignored_updates
FOR SELECT
USING (
    user_id = current_setting('app.user_id')::uuid
);

-- Policy for food_entries table
CREATE POLICY food_entries_update_delete_policy ON public.food_entries
FOR ALL -- Applies to UPDATE and DELETE
USING (
    -- 1. The diary owner can always manage their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. A user with 'can_manage_diary' can manage the owner's entries
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.food_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entries table
CREATE POLICY exercise_entries_update_delete_policy ON public.exercise_entries
FOR ALL -- Applies to UPDATE and DELETE
USING (
    -- 1. The diary owner can always manage their own entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- 2. A user with 'can_manage_diary' can manage the owner's entries
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercise_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entry_sets table
CREATE POLICY exercise_entry_sets_update_delete_policy ON public.exercise_entry_sets
FOR ALL -- Applies to UPDATE and DELETE
USING (
    -- A user can manage sets if they can manage the parent exercise_entry
    EXISTS (
        SELECT 1
        FROM public.exercise_entries ee
        WHERE ee.id = public.exercise_entry_sets.exercise_entry_id
          AND (
            -- 1. The diary owner can manage their own sets
            ee.user_id = current_setting('app.user_id')::uuid
            OR
            -- 2. A user with 'can_manage_diary' can manage the owner's sets
            EXISTS (
                SELECT 1
                FROM public.family_access fa
                WHERE fa.owner_user_id = ee.user_id
                  AND fa.family_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
            )
        )
    )
);

-- Policy for user_ignored_updates table (users can update/delete their own ignored updates)
CREATE POLICY user_ignored_updates_update_delete_policy ON public.user_ignored_updates
FOR ALL
USING (
    user_id = current_setting('app.user_id')::uuid
);

-- Policy for food_entries table
CREATE POLICY food_entries_insert_policy ON public.food_entries
FOR INSERT
WITH CHECK (
    -- User can insert their own food entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can insert food entries for another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.food_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entries table
CREATE POLICY exercise_entries_insert_policy ON public.exercise_entries
FOR INSERT
WITH CHECK (
    -- User can insert their own exercise entries
    user_id = current_setting('app.user_id')::uuid
    OR
    -- User can insert exercise entries for another user if they have 'can_manage_diary' permission
    EXISTS (
        SELECT 1
        FROM public.family_access fa
        WHERE fa.owner_user_id = public.exercise_entries.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
    )
);

-- Policy for exercise_entry_sets table
CREATE POLICY exercise_entry_sets_insert_policy ON public.exercise_entry_sets
FOR INSERT
WITH CHECK (
    -- User can insert sets if they can insert the parent exercise_entry
    EXISTS (
        SELECT 1
        FROM public.exercise_entries ee
        WHERE ee.id = public.exercise_entry_sets.exercise_entry_id
          AND (
            ee.user_id = current_setting('app.user_id')::uuid
            OR
            EXISTS (
                SELECT 1
                FROM public.family_access fa
                WHERE fa.owner_user_id = ee.user_id
                  AND fa.family_user_id = current_setting('app.user_id')::uuid
                  AND fa.is_active = TRUE
                  AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
            )
          )
    )
);

-- Policy for user_ignored_updates table (users can insert their own ignored updates)
CREATE POLICY user_ignored_updates_insert_policy ON public.user_ignored_updates
FOR INSERT
WITH CHECK (
    user_id = current_setting('app.user_id')::uuid
);

-- Policy for family_access table (users can insert their own family access requests)
CREATE POLICY family_access_insert_policy ON public.family_access
FOR INSERT
WITH CHECK (
    owner_user_id = current_setting('app.user_id')::uuid
    OR
    family_user_id = current_setting('app.user_id')::uuid
);

-- Generic policy for tables where a user only ever accesses their own data
CREATE OR REPLACE FUNCTION create_user_centric_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_user_policy ON public.%1$s;
        CREATE POLICY %1$s_user_policy ON public.%1$s
        FOR ALL
        USING (user_id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (user_id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply the generic policy to all relevant tables
SELECT create_user_centric_policy('user_goals');
SELECT create_user_centric_policy('goal_presets');
SELECT create_user_centric_policy('user_preferences');
SELECT create_user_centric_policy('user_water_containers');
SELECT create_user_centric_policy('ai_service_settings');
SELECT create_user_centric_policy('check_in_measurements');
SELECT create_user_centric_policy('custom_categories');
SELECT create_user_centric_policy('custom_measurements');
SELECT create_user_centric_policy('external_data_providers');
SELECT create_user_centric_policy('meal_plans');
SELECT create_user_centric_policy('sparky_chat_history');
SELECT create_user_centric_policy('user_api_keys');
SELECT create_user_centric_policy('user_goals');
SELECT create_user_centric_policy('user_nutrient_display_preferences');
SELECT create_user_centric_policy('water_intake');
SELECT create_user_centric_policy('weekly_goal_plans');
SELECT create_user_centric_policy('mood_entries');

-- Policies for tables with `id` instead of `user_id` for owner
DROP POLICY IF EXISTS profiles_rls ON public.profiles;
CREATE POLICY profiles_rls ON public.profiles
FOR ALL
USING (id = current_setting('app.user_id')::uuid)
WITH CHECK (id = current_setting('app.user_id')::uuid);

-- Policies for tables referencing other tables with RLS
DROP POLICY IF EXISTS food_variants_rls ON public.food_variants;
CREATE POLICY food_variants_rls ON public.food_variants
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = food_variants.food_id
    )
);

DROP POLICY IF EXISTS meal_foods_rls ON public.meal_foods;
CREATE POLICY meal_foods_rls ON public.meal_foods
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.meals m
        WHERE m.id = meal_foods.meal_id
    )
);

DROP POLICY IF EXISTS meal_plan_template_assignments_rls ON public.meal_plan_template_assignments;
CREATE POLICY meal_plan_template_assignments_rls ON public.meal_plan_template_assignments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.meal_plan_templates mpt
        WHERE mpt.id = meal_plan_template_assignments.template_id
          AND mpt.user_id = current_setting('app.user_id')::uuid
    )
);

DROP POLICY IF EXISTS workout_plan_template_assignments_rls ON public.workout_plan_template_assignments;
CREATE POLICY workout_plan_template_assignments_rls ON public.workout_plan_template_assignments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.workout_plan_templates wpt
        WHERE wpt.id = workout_plan_template_assignments.template_id
          AND wpt.user_id = current_setting('app.user_id')::uuid
    )
);

DROP POLICY IF EXISTS workout_plan_assignment_sets_rls ON public.workout_plan_assignment_sets;
CREATE POLICY workout_plan_assignment_sets_rls ON public.workout_plan_assignment_sets
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.workout_plan_template_assignments wpta
        WHERE wpta.id = workout_plan_assignment_sets.assignment_id
    )
);

DROP POLICY IF EXISTS workout_preset_exercise_sets_rls ON public.workout_preset_exercise_sets;
CREATE POLICY workout_preset_exercise_sets_rls ON public.workout_preset_exercise_sets
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.workout_preset_exercises wpe
        WHERE wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id
    )
);

DROP POLICY IF EXISTS workout_preset_exercises_rls ON public.workout_preset_exercises;
CREATE POLICY workout_preset_exercises_rls ON public.workout_preset_exercises
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.workout_presets wp
        WHERE wp.id = workout_preset_exercises.workout_preset_id
    )
);

DROP POLICY IF EXISTS user_oidc_links_rls ON public.user_oidc_links;
CREATE POLICY user_oidc_links_rls ON public.user_oidc_links
FOR ALL
USING (user_id = current_setting('app.user_id')::uuid)
WITH CHECK (user_id = current_setting('app.user_id')::uuid);


-- Policies for Sharable Library Items (Workout/Meal Plans & Presets)
-- These can be seen by their owner, or by friends with the correct library permission.

-- Workout Presets
DROP POLICY IF EXISTS workout_presets_select_policy ON public.workout_presets;
CREATE POLICY workout_presets_select_policy ON public.workout_presets
FOR SELECT
USING (
    user_id = current_setting('app.user_id')::uuid OR
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.workout_presets.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_exercise_library')::boolean = TRUE
    )
);

-- Workout Plan Templates
DROP POLICY IF EXISTS workout_plan_templates_select_policy ON public.workout_plan_templates;
CREATE POLICY workout_plan_templates_select_policy ON public.workout_plan_templates
FOR SELECT
USING (
    user_id = current_setting('app.user_id')::uuid OR
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.workout_plan_templates.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_exercise_library')::boolean = TRUE
    )
);

-- Meal Plan Templates
DROP POLICY IF EXISTS meal_plan_templates_select_policy ON public.meal_plan_templates;
CREATE POLICY meal_plan_templates_select_policy ON public.meal_plan_templates
FOR SELECT
USING (
    user_id = current_setting('app.user_id')::uuid OR
    EXISTS (
        SELECT 1 FROM public.family_access fa
        WHERE fa.owner_user_id = public.meal_plan_templates.user_id
          AND fa.family_user_id = current_setting('app.user_id')::uuid
          AND fa.is_active = TRUE
          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
    )
);

-- Policies for INSERT/UPDATE/DELETE on Library Items (Owner only)
DROP POLICY IF EXISTS workout_presets_modify_policy ON public.workout_presets;
CREATE POLICY workout_presets_modify_policy ON public.workout_presets
FOR ALL USING (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS workout_plan_templates_modify_policy ON public.workout_plan_templates;
CREATE POLICY workout_plan_templates_modify_policy ON public.workout_plan_templates
FOR ALL USING (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS meal_plan_templates_modify_policy ON public.meal_plan_templates;
CREATE POLICY meal_plan_templates_modify_policy ON public.meal_plan_templates
FOR ALL USING (user_id = current_setting('app.user_id')::uuid);