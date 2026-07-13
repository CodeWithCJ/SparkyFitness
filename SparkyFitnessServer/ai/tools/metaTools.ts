import { tool } from 'ai';
import { z } from 'zod';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  type ChatToolCategorySlug,
} from '@workspace/shared';
import { formatZodError } from './errors.js';

/**
 * One-line capability summary per category, surfaced in the tool description
 * so the model can pick the right categories to enable, and reused by the
 * system prompt's dormant-domain listing.
 */
export const CATEGORY_SUMMARIES: Record<ChatToolCategorySlug, string> = {
  food: 'log meals/water, search foods, view diaries (tools: sparky_manage_food, sparky_list_foods, sparky_get_food_details, sparky_search_foods, sparky_get_food_diary, sparky_get_nutrition_summary, sparky_get_recent_food_entries, sparky_get_food_usage)',
  exercise:
    'log workouts, search exercises, view exercise diaries (tools: sparky_manage_exercise, sparky_list_exercises, sparky_get_exercise_details, sparky_search_exercises, sparky_get_exercise_diary, sparky_get_daily_exercise_totals, sparky_get_recent_exercise_entries, sparky_get_exercise_usage, sparky_get_exercise_progress)',
  checkin:
    'log weight, measurements, mood, sleep, fasting, check-ins (tools: sparky_manage_checkin)',
  goals:
    'view/change goals and targets (tools: sparky_manage_goals, sparky_get_goal_snapshot)',
  reports:
    'daily/weekly summaries, progress reports, trends, TDEE (tools: sparky_get_report, sparky_get_daily_report)',
  coaching:
    'coaching plans, nudges, patterns, and check-in wizard (tools: sparky_generate_coaching_plan, sparky_get_health_summary, sparky_analyze_trends, sparky_get_30_day_trends, sparky_detect_patterns, sparky_check_engagement, sparky_get_logging_streak, sparky_get_contextual_nudge, sparky_daily_checkin_wizard)',
  vision:
    'analyze food photos and scan nutrition labels (tools: sparky_analyze_food_image, sparky_scan_label)',
  profile:
    'profile details, preferences, units, timezone, habits (tools: sparky_manage_profile, sparky_manage_habits)',
};

const EnableToolsSchema = z.object({
  categories: z
    .array(z.enum(CHAT_TOOL_CATEGORY_SLUGS))
    .min(1)
    .describe('The tool categories to enable for the rest of this request.'),
});

export const ENABLE_TOOLS_TOOL_NAME = 'sparky_enable_tools';

/**
 * Chat-only escalation tool: when the request needs a tool domain that is not
 * currently loaded, the model calls this with the missing category slugs and
 * the server exposes those tools on the next agent step (see prepareStep in
 * services/chatService.ts). execute() is stateless — it only validates and
 * confirms — so the memoized tool map stays safely shareable across requests;
 * the actual widening is derived from the recorded tool call itself. Not part
 * of the MCP surface (MCP clients always see the full tool set).
 */
export function buildMetaTools() {
  return {
    [ENABLE_TOOLS_TOOL_NAME]: tool({
      description:
        'Enables additional tool categories when the current request needs tools that are not loaded. ' +
        'Call this BEFORE telling the user something cannot be done. Categories: ' +
        CHAT_TOOL_CATEGORY_SLUGS.map(
          (slug) => `${slug} (${CATEGORY_SUMMARIES[slug]})`
        ).join('; ') +
        '.',
      inputSchema: EnableToolsSchema,
      execute: async (rawArgs) => {
        const parsed = EnableToolsSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const categories = [...new Set(parsed.data.categories)];
        return `Enabled tool categories: ${categories.join(', ')}. The tools are now available — continue with the user's request.`;
      },
    }),
  };
}
