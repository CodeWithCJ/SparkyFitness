import { buildCheckinTools } from './checkinTools.js';
import { buildCoachTools } from './coachTools.js';
import { buildEngagementTools } from './engagementTools.js';
import { buildExerciseTools } from './exerciseTools.js';
import { buildFoodTools } from './foodTools.js';
import { buildGoalTools } from './goalTools.js';
import { buildHabitTools } from './habitTools.js';
import { buildProfileTools } from './profileTools.js';
import { buildReportTools } from './reportTools.js';
import { buildVisionTools } from './visionTools.js';
import { buildWizardTools } from './wizardTools.js';

/**
 * Tool surfaces the chatbot can expose:
 * - 'full': every chat-visible tool (the default).
 * - 'core': the food/exercise/measurement logging the system prompt centers
 *   on, plus goals (a coaching chat needs to answer "what are my goals?").
 *   Used for small/local models (e.g. Ollama's default 3B llama3.2) that have
 *   no prompt cache — so the whole tool block is reprocessed every turn — and
 *   select tools more reliably from a smaller surface. Analytics, coaching,
 *   vision, profile, habits, the check-in wizard, and reports are dropped.
 */
export type ChatToolProfile = 'full' | 'core';

/**
 * Composes the in-process chatbot tool set for generateText/streamText.
 * Handlers close over the authenticated userId — chat tools always act as the
 * session user, so two-actor services receive (userId, userId, …) — and the
 * user's IANA timezone, used for "today" defaults and day bucketing.
 *
 * Domain order mirrors MCP's registerAllTools; the MCP-only dev tools are
 * intentionally not part of the chat surface. The 'core' profile is a strict
 * prefix of the full set, so the full set keeps its original ordering.
 */
export function buildChatbotTools(
  userId: string,
  tz: string,
  profile: ChatToolProfile = 'full'
) {
  // Core domains: food, exercise, measurements/check-ins, and goals. Goals are
  // in core because a nutrition-coaching chat must be able to answer "what are
  // my goals?"; keeping this block a strict prefix of the full set below.
  const tools = {
    ...buildExerciseTools(userId, tz),
    ...buildFoodTools(userId, tz),
    ...buildCheckinTools(userId, tz),
    ...buildGoalTools(userId, tz),
  };
  if (profile === 'full') {
    Object.assign(
      tools,
      buildCoachTools(userId, tz),
      buildEngagementTools(userId, tz),
      buildVisionTools(userId),
      buildProfileTools(userId),
      buildHabitTools(userId, tz),
      buildWizardTools(userId),
      buildReportTools(userId, tz)
    );
  }
  // The published flat schemas are advisory; real validation is the strict
  // per-action union inside each handler. Strict provider-side mode must stay
  // off: OpenAI's Responses API treats an omitted flag as "attempt strict
  // mode" and then forces models to emit every published property, producing
  // placeholder junk that the per-action validation rejects.
  const allTools = Object.values(tools);
  for (const tool of allTools) {
    tool.strict = false;
  }

  // Anthropic prompt caching: tag the final tool as a cache breakpoint so the
  // entire (static, user-independent) tool-schema block — the bulk of every
  // request prefix — is written once and re-read across the multi-step agent
  // loop and conversation turns. Provider-namespaced: non-Anthropic providers
  // ignore it (and auto-cache on their own). MUST be the LAST tool the SDK
  // emits (Anthropic caches the prefix up to & including the marked tool). This
  // relies on the AI SDK preserving Object.values() order when building the
  // Anthropic `tools` array — true today; if a package bump reorders tools this
  // stops caching the full block silently (no error). Merge, don't overwrite,
  // so any future providerOptions on this tool (e.g. deferLoading) survive.
  const lastTool = allTools[allTools.length - 1];
  if (lastTool) {
    lastTool.providerOptions = {
      ...lastTool.providerOptions,
      anthropic: {
        ...(lastTool.providerOptions?.anthropic as
          | Record<string, unknown>
          | undefined),
        cacheControl: { type: 'ephemeral' },
      },
    };
  }
  return tools;
}
