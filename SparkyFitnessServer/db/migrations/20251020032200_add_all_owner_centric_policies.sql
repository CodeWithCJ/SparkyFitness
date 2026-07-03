-- Generic policy for tables where a user only ever accesses their own data
CREATE OR REPLACE FUNCTION create_owner_centric_all_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_all_policy ON public.%1$s;
        CREATE POLICY %1$s_all_policy ON public.%1$s
        FOR ALL
        TO PUBLIC
        USING (user_id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (user_id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply the generic policy to all relevant tables
SELECT create_owner_centric_all_policy('ai_service_settings');
-- SELECT create_owner_centric_all_policy('backup_settings'); -- No user_id
SELECT create_owner_centric_all_policy('check_in_measurements');
SELECT create_owner_centric_all_policy('custom_categories');
SELECT create_owner_centric_all_policy('custom_measurements');
SELECT create_owner_centric_all_policy('exercise_entries');
-- SELECT create_owner_centric_all_policy('exercise_entry_sets'); -- Linked to exercise_entries
SELECT create_owner_centric_all_policy('exercises');
SELECT create_owner_centric_all_policy('external_data_providers');
-- SELECT create_owner_centric_all_policy('family_access'); -- Has its own policy
SELECT create_owner_centric_all_policy('food_entries');
-- SELECT create_owner_centric_all_policy('food_variants'); -- Linked to foods
SELECT create_owner_centric_all_policy('foods');
-- SELECT create_owner_centric_all_policy('global_settings'); -- No user_id
SELECT create_owner_centric_all_policy('goal_presets');
-- SELECT create_owner_centric_all_policy('meal_foods'); -- Linked to meals
-- SELECT create_owner_centric_all_policy('meal_plan_template_assignments'); -- Linked to meal_plan_templates
SELECT create_owner_centric_all_policy('meal_plan_templates');
SELECT create_owner_centric_all_policy('meal_plans');
SELECT create_owner_centric_all_policy('meals');
SELECT create_owner_centric_all_policy('mood_entries');
-- SELECT create_owner_centric_all_policy('oidc_providers'); -- No user_id
-- SELECT create_owner_centric_all_policy('session'); -- No user_id
SELECT create_owner_centric_all_policy('sparky_chat_history');
SELECT create_owner_centric_all_policy('user_api_keys');
SELECT create_owner_centric_all_policy('user_goals');
SELECT create_owner_centric_all_policy('user_ignored_updates');
SELECT create_owner_centric_all_policy('user_nutrient_display_preferences');
-- SELECT create_owner_centric_all_policy('user_oidc_links'); -- Has its own policy
SELECT create_owner_centric_all_policy('user_preferences');
SELECT create_owner_centric_all_policy('user_water_containers');
SELECT create_owner_centric_all_policy('water_intake');
SELECT create_owner_centric_all_policy('weekly_goal_plans');
-- SELECT create_owner_centric_all_policy('workout_plan_assignment_sets'); -- Linked to workout_plan_template_assignments
-- SELECT create_owner_centric_all_policy('workout_plan_template_assignments'); -- Linked to workout_plan_templates
SELECT create_owner_centric_all_policy('workout_plan_templates');
-- SELECT create_owner_centric_all_policy('workout_preset_exercise_sets'); -- Linked to workout_preset_exercises
-- SELECT create_owner_centric_all_policy('workout_preset_exercises'); -- Linked to workout_presets
SELECT create_owner_centric_all_policy('workout_presets');

-- Policies for tables with `id` instead of `user_id` for owner
CREATE OR REPLACE FUNCTION create_owner_centric_id_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_all_policy ON public.%1$s;
        CREATE POLICY %1$s_all_policy ON public.%1$s
        FOR ALL
        TO PUBLIC
        USING (id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$$ LANGUAGE plpgsql;

SELECT create_owner_centric_id_policy('profiles');
-- SELECT create_owner_centric_id_policy('user_oidc_links'); -- Has its own policy
-- SELECT create_owner_centric_id_policy('user_oidc_links'); -- Has its own policy