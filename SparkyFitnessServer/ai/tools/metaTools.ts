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
 * system prompt's dormant-domain listing. Capabilities only, no tool names:
 * the model sees a category's tools once it is enabled, and these strings are
 * sent with every request.
 */
export const CATEGORY_SUMMARIES: Record<ChatToolCategorySlug, string> = {
  food: 'log meals/water, search foods, view diaries, favorites, meal plans, saved food preferences and recipe/meal-plan tasks, active caffeine, custom nutrients, water containers, allergens, and barcode lookup',
  exercise:
    'log workouts, search exercises, suggest alternative exercises (injury, equipment, variety), rate how workouts felt and explain adaptive workout suggestions, view exercise diaries, exercise stats/analytics, create/manage workout plans and next workouts, follow and adjust a run program such as Beginner 5K',
  checkin:
    'log weight, measurements, mood, sleep, fasting, check-ins, progress photos, and sleep-science analytics',
  goals: 'view/change goals and targets',
  reports:
    'daily/weekly summaries, progress reports, trends, TDEE, the daily dashboard calorie-balance summary, and whether two tracked things go together or changed since a habit started',
  coaching:
    'coaching plans, weekly calorie target review, nudges, patterns, and check-in wizard',
  vision: 'analyze food photos and scan nutrition labels',
  profile:
    'profile details, preferences, units, timezone, habits, connected integrations, and synced-data listing',
  medications: 'medication and GLP-1 tracking',
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
