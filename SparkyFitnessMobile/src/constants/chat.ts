import type { IconName } from '../components/Icon';
import { mobileT } from '../localization';

/**
 * Tappable starter prompts shown in the empty chat state. Tuned for mobile from
 * the web app's defaults — short, action-oriented, one per row.
 */
export const CHAT_SUGGESTIONS = [
  mobileT('chat.suggestion.breakfast'),
  mobileT('chat.suggestion.run'),
  mobileT('chat.suggestion.calories'),
  mobileT('chat.suggestion.snack'),
] as const;

export interface ToolDisplay {
  label: string;
  icon: IconName;
}

/**
 * Localized labels + icons for the tools the server exposes over
 * `/api/chat/stream`. Unknown lookups receive a generic data label, while any
 * other unknown tool receives a generic Sparky-tool label so technical names
 * are never exposed in the interface.
 */
const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  sparky_manage_food: { label: mobileT('chat.tool.manageFood'), icon: 'food' },
  sparky_manage_exercise: { label: mobileT('chat.tool.manageExercise'), icon: 'exercise' },
  sparky_manage_checkin: { label: mobileT('chat.tool.manageCheckin'), icon: 'measurements' },
  sparky_manage_goals: { label: mobileT('chat.tool.manageGoals'), icon: 'flame' },
  sparky_manage_habits: { label: mobileT('chat.tool.manageHabits'), icon: 'checkmark-circle' },
  sparky_manage_profile: { label: mobileT('chat.tool.manageProfile'), icon: 'settings' },
  sparky_get_30_day_trends: { label: mobileT('chat.tool.trends30Days'), icon: 'search' },
  sparky_get_30day_trends: { label: mobileT('chat.tool.trends30Days'), icon: 'search' },
  sparky_get_health_summary: { label: mobileT('chat.tool.healthSummary'), icon: 'search' },
  sparky_get_db_stats: { label: mobileT('chat.tool.databaseStats'), icon: 'search' },
  sparky_get_user_info: { label: mobileT('chat.tool.userInfo'), icon: 'search' },
  sparky_get_contextual_nudge: { label: mobileT('chat.tool.contextualNudge'), icon: 'search' },
  sparky_get_logging_streak: { label: mobileT('chat.tool.loggingStreak'), icon: 'search' },
  sparky_get_daily_exercise_totals: { label: mobileT('chat.tool.dailyExerciseTotals'), icon: 'search' },
  sparky_get_exercise_details: { label: mobileT('chat.tool.exerciseDetails'), icon: 'search' },
  sparky_get_exercise_diary: { label: mobileT('chat.tool.exerciseDiary'), icon: 'search' },
  sparky_get_exercise_progress: { label: mobileT('chat.tool.exerciseProgress'), icon: 'search' },
  sparky_get_exercise_usage: { label: mobileT('chat.tool.exerciseUsage'), icon: 'search' },
  sparky_get_recent_exercise_entries: { label: mobileT('chat.tool.recentExerciseEntries'), icon: 'search' },
  sparky_get_food_details: { label: mobileT('chat.tool.foodDetails'), icon: 'search' },
  sparky_get_food_diary: { label: mobileT('chat.tool.foodDiary'), icon: 'search' },
  sparky_get_food_usage: { label: mobileT('chat.tool.foodUsage'), icon: 'search' },
  sparky_get_nutrition_summary: { label: mobileT('chat.tool.nutritionSummary'), icon: 'search' },
  sparky_get_nutritional_summary: { label: mobileT('chat.tool.nutritionSummary'), icon: 'search' },
  sparky_get_recent_food_entries: { label: mobileT('chat.tool.recentFoodEntries'), icon: 'search' },
  sparky_get_goal_snapshot: { label: mobileT('chat.tool.goalSnapshot'), icon: 'search' },
  sparky_get_daily_report: { label: mobileT('chat.tool.dailyReport'), icon: 'search' },
  sparky_get_report: { label: mobileT('chat.tool.report'), icon: 'search' },
  sparky_search_foods: { label: mobileT('chat.tool.searchFoods'), icon: 'search' },
  sparky_search_exercises: { label: mobileT('chat.tool.searchExercises'), icon: 'search' },
};

/**
 * Lookup/search tools (`sparky_get_*`) return raw data meant for the model, not
 * the user (the server serializes it as JSON via `formatSuccess`). The card
 * hides their result body and shows just the labeled status.
 */
export function isLookupTool(toolName: string): boolean {
  return /^sparky_get_/.test(toolName);
}

/** Resolves the display label + icon for a tool call by name. */
export function getToolDisplay(toolName: string): ToolDisplay {
  const explicit = TOOL_DISPLAY[toolName];
  if (explicit) return explicit;

  if (isLookupTool(toolName)) {
    return { label: mobileT('chat.tool.lookup'), icon: 'search' };
  }

  return { label: mobileT('chat.tool.generic'), icon: 'wrench' };
}
