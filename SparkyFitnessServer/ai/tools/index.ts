import { Tool } from 'ai';
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

type ToolMap = Record<string, Tool>;

// Composes the raw per-domain tool builders. Domain order mirrors MCP's
// registerAllTools; the MCP-only dev tools are intentionally not part of this
// surface. The 'core' profile is a strict prefix of the full set, so the full
// set keeps its original ordering.
function composeTools(
  userId: string,
  tz: string,
  profile: ChatToolProfile
): ToolMap {
  // Core domains: food, exercise, measurements/check-ins, and goals. Goals are
  // in core because a nutrition-coaching chat must be able to answer "what are
  // my goals?"; keeping this block a strict prefix of the full set below.
  const tools: ToolMap = {
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
  return tools;
}

// Applies chat-provider tuning that only matters when the tools are sent to an
// LLM provider through the AI SDK. The MCP surface skips this — MCP publishes
// the schemas over JSON-RPC where strict-mode flags and Anthropic cache
// markers are meaningless.
function applyChatProviderTuning(tools: ToolMap): void {
  // The published flat schemas are advisory; real validation is the strict
  // per-action union inside each handler. Strict provider-side mode must stay
  // off: OpenAI's Responses API treats an omitted flag as "attempt strict
  // mode" and then forces models to emit every published property, producing
  // placeholder junk that the per-action validation rejects.
  const names = Object.keys(tools);
  for (const name of names) {
    tools[name].strict = false;
  }

  // Anthropic prompt caching: tag the final tool as a cache breakpoint so the
  // entire (static, user-independent) tool-schema block — the bulk of every
  // request prefix — is written once and re-read across the multi-step agent
  // loop and conversation turns. Provider-namespaced: non-Anthropic providers
  // ignore it (and auto-cache on their own). MUST be the LAST tool the SDK
  // emits (Anthropic caches the prefix up to & including the marked tool). This
  // relies on the AI SDK preserving Object.values() order when building the
  // Anthropic `tools` array — true today; tests/chatbotToolsIndex.test.ts
  // asserts the marker lands on the final composed tool so a domain reorder or
  // new trailing domain can't silently drop caching. Merge, don't overwrite,
  // so any future providerOptions on this tool (e.g. deferLoading) survive.
  const lastTool = tools[names[names.length - 1]];
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
}

// Memoized per (userId, tz, profile, tuning): the Zod schemas are module-level
// constants, but the ~35 tool() wrappers and closures were being rebuilt on
// every chat message and every MCP request. Entries expire so a user's
// timezone change is picked up within a minute; execute() closures are
// stateless, so reuse across concurrent requests is safe. Callers must not
// mutate the returned map.
const TOOL_CACHE_TTL_MS = 60_000;
const TOOL_CACHE_MAX_ENTRIES = 500;
const toolCache = new Map<string, { tools: ToolMap; expiresAt: number }>();

/**
 * Composes the in-process chatbot tool set for generateText/streamText.
 * Handlers close over the authenticated userId — chat tools always act as the
 * session user, so two-actor services receive (userId, userId, …) — and the
 * user's IANA timezone, used for "today" defaults and day bucketing.
 *
 * `providerTuning` (default true) applies the chat/AI-SDK provider settings
 * (strict off, Anthropic cache breakpoint). The MCP adapter passes false to
 * publish a clean provider-independent surface.
 */
export function buildChatbotTools(
  userId: string,
  tz: string,
  profile: ChatToolProfile = 'full',
  providerTuning = true
): ToolMap {
  const key = `${providerTuning ? 'chat' : 'mcp'}|${profile}|${tz}|${userId}`;
  const now = Date.now();
  const cached = toolCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.tools;
  }

  const tools = composeTools(userId, tz, profile);
  if (providerTuning) {
    applyChatProviderTuning(tools);
  }

  if (toolCache.size >= TOOL_CACHE_MAX_ENTRIES) {
    // Simple pressure valve: drop the oldest entries (insertion order).
    const firstKey = toolCache.keys().next().value;
    if (firstKey !== undefined) toolCache.delete(firstKey);
  }
  toolCache.set(key, { tools, expiresAt: now + TOOL_CACHE_TTL_MS });
  return tools;
}
