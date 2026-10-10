/**
 * Which MCP tools, and which of their actions, only read data (issue #2678).
 *
 * - `'read'`: the whole tool reads. It is published with `readOnlyHint: true`
 *   and offered to read-only API keys.
 * - a list of actions: the tool mixes reads and writes. Read-only API keys
 *   still see it, but only the listed `action` values run for them.
 * - not listed: the tool writes. Read-only API keys do not get it.
 *
 * Anything missing from this map is treated as a write, so a new tool or a new
 * action stays unavailable to read-only keys until it is classified here.
 * tests/mcpToolAccess.test.ts fails when an entry names a tool or action that
 * does not exist.
 */
export type ToolReadAccess = 'read' | readonly string[];

export const MCP_TOOL_READ_ACCESS: Readonly<Record<string, ToolReadAccess>> = {
  // exercise
  sparky_manage_exercise: [
    'search_exercises',
    'list_exercise_diary',
    'get_workout_presets',
    'get_workout_preset',
    'get_exercise_details',
    'get_exercise_progress',
    'suggest_alternatives',
    'get_workout_coaching',
  ],
  sparky_list_exercises: 'read',
  sparky_get_exercise_details: 'read',
  sparky_search_exercises: 'read',
  sparky_get_exercise_diary: 'read',
  sparky_get_daily_exercise_totals: 'read',
  sparky_get_recent_exercise_entries: 'read',
  sparky_get_exercise_usage: 'read',
  sparky_get_exercise_progress: 'read',
  sparky_get_exercise_stats: 'read',
  sparky_manage_workout_plans: [
    'list_workout_plans',
    'get_workout_plan',
    'get_active_workout_plan',
  ],
  // food
  sparky_manage_food: [
    'search_food',
    'lookup_food_nutrition',
    'list_meal_types',
    'search_meal',
    'list_diary',
    'get_nutritional_summary',
    'get_water_history',
  ],
  sparky_list_foods: 'read',
  sparky_get_food_details: 'read',
  sparky_search_foods: 'read',
  sparky_get_food_diary: 'read',
  sparky_get_nutrition_summary: 'read',
  sparky_get_recent_food_entries: 'read',
  sparky_get_food_usage: 'read',
  sparky_manage_favorites: ['list_favorites'],
  sparky_manage_meal_plans: ['list_meal_plans', 'get_meal_plan'],
  sparky_food_assistant_state: ['list_preferences', 'list_tasks', 'get_task'],
  sparky_manage_recipes: ['get_recipe', 'preview_recipe'],
  sparky_manage_diary: ['inspect'],
  sparky_food_planning: ['inspect_plan', 'preview_plan'],
  sparky_manage_custom_nutrients: [
    'list_custom_nutrients',
    'get_custom_nutrient',
  ],
  sparky_manage_water_containers: [
    'list_water_containers',
    'get_water_container',
  ],
  sparky_get_caffeine_kinetics: 'read',
  sparky_manage_allergens: ['list_allergens'],
  sparky_get_barcode: 'read',
  // check-in
  sparky_manage_checkin: [
    'list_categories',
    'list_checkin_diary',
    'get_fasting_status',
    'get_biometrics_history',
    'get_custom_metrics_history',
  ],
  sparky_manage_progress_photos: ['list_photo_dates', 'list_photos'],
  // recalculate_baseline stores a new baseline, so it stays out.
  sparky_get_sleep_science: [
    'sleep_debt',
    'mctq_stats',
    'daily_need',
    'energy_curve',
    'chronotype',
    'data_sufficiency',
  ],
  sparky_manage_symptoms: [
    'list_definitions',
    'list_entries',
    'get_ongoing',
    'list_options',
    'get_metrics',
  ],
  // goals
  sparky_manage_goals: ['get_goals', 'list_goal_timeline'],
  sparky_get_goal_snapshot: 'read',
  // coaching
  sparky_get_health_summary: 'read',
  sparky_analyze_trends: 'read',
  sparky_get_30_day_trends: 'read',
  sparky_detect_patterns: 'read',
  sparky_generate_coaching_plan: 'read',
  sparky_check_engagement: 'read',
  sparky_get_logging_streak: 'read',
  sparky_get_contextual_nudge: 'read',
  // vision: both only ask the user's AI provider, like POST /api/foods/scan-label
  sparky_analyze_food_image: 'read',
  sparky_scan_label: 'read',
  // profile
  sparky_manage_profile: ['get_profile', 'get_preferences'],
  sparky_manage_habits: ['list_habits', 'get_habit_history'],
  sparky_get_integrations: 'read',
  sparky_get_synced_data: 'read',
  // reports
  sparky_get_report: 'read',
  sparky_get_daily_report: 'read',
  sparky_get_dashboard: 'read',
  // medications
  sparky_manage_medications: [
    'list_medications',
    'get_medication',
    'list_entries',
    'list_injections',
    'list_schedules',
  ],
  // admin-only dev tools (registered only when enabled for an admin)
  sparky_inspect_schema: 'read',
  sparky_get_user_info: 'read',
  sparky_get_db_stats: 'read',
  sparky_query_table: 'read',
  sparky_execute_read_only_sql: 'read',
};

/** Whether `toolName` is offered to a read-only API key at all. */
export function isToolAvailableReadOnly(toolName: string): boolean {
  return Object.hasOwn(MCP_TOOL_READ_ACCESS, toolName);
}

/** Whether the whole tool only reads (published with `readOnlyHint: true`). */
export function isReadOnlyTool(toolName: string): boolean {
  return MCP_TOOL_READ_ACCESS[toolName] === 'read';
}

/** Whether a read-only API key may run `toolName` with these arguments. */
export function isToolCallAllowedReadOnly(
  toolName: string,
  args: unknown
): boolean {
  if (!Object.hasOwn(MCP_TOOL_READ_ACCESS, toolName)) return false;
  const access = MCP_TOOL_READ_ACCESS[toolName];
  if (access === 'read') return true;
  const action =
    args && typeof args === 'object'
      ? (args as { action?: unknown }).action
      : undefined;
  return typeof action === 'string' && access.includes(action);
}
