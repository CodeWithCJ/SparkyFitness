import { Tool } from 'ai';
import { z } from 'zod';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  CORE_CHAT_TOOL_CATEGORY_SLUGS,
  isChatToolCategorySlug,
  type ChatToolCategorySlug,
} from '@workspace/shared';
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

// Category slug -> the per-domain builders it composes. Iteration order (both
// this map and the array within each entry) IS the composed tool order, so it
// mirrors the historical builder ordering — the Anthropic cache breakpoint
// lands on whatever ends up last (see applyChatProviderTuning), and
// tests/chatbotToolsIndex.test.ts pins the full/core surfaces against it.
const CATEGORY_BUILDERS: Record<
  ChatToolCategorySlug,
  ((userId: string, tz: string) => ToolMap)[]
> = {
  exercise: [(u, tz) => buildExerciseTools(u, tz)],
  food: [(u, tz) => buildFoodTools(u, tz)],
  checkin: [(u, tz) => buildCheckinTools(u, tz)],
  goals: [(u, tz) => buildGoalTools(u, tz)],
  coaching: [
    (u, tz) => buildCoachTools(u, tz),
    (u, tz) => buildEngagementTools(u, tz),
    (u) => buildWizardTools(u),
  ],
  vision: [(u) => buildVisionTools(u)],
  profile: [(u) => buildProfileTools(u), (u, tz) => buildHabitTools(u, tz)],
  reports: [(u, tz) => buildReportTools(u, tz)],
};

// Composition order: the core categories first (a strict prefix of the full
// set, preserved from the original layout), then the full-only categories.
const CATEGORY_ORDER: ChatToolCategorySlug[] = [
  'exercise',
  'food',
  'checkin',
  'goals',
  'coaching',
  'vision',
  'profile',
  'reports',
];

// Resolves the category set to compose: an explicit (already-validated,
// non-empty) selection wins; otherwise the profile's default set ('core' ->
// the shared core slugs, 'full' -> every category).
function resolveCategories(
  profile: ChatToolProfile,
  categories?: readonly string[]
): Set<ChatToolCategorySlug> {
  if (categories && categories.length > 0) {
    const valid = categories.filter(isChatToolCategorySlug);
    if (valid.length > 0) return new Set(valid);
  }
  return new Set(
    profile === 'core'
      ? CORE_CHAT_TOOL_CATEGORY_SLUGS
      : CHAT_TOOL_CATEGORY_SLUGS
  );
}

// Composes the raw per-domain tool builders for the resolved category set. The
// MCP-only dev tools are intentionally not part of this surface.
function composeTools(
  userId: string,
  tz: string,
  profile: ChatToolProfile,
  categories?: readonly string[]
): ToolMap {
  const selected = resolveCategories(profile, categories);
  const tools: ToolMap = {};
  for (const slug of CATEGORY_ORDER) {
    if (!selected.has(slug)) continue;
    for (const build of CATEGORY_BUILDERS[slug]) {
      Object.assign(tools, build(userId, tz));
    }
  }
  return tools;
}

// Recursively drops null-valued keys so a model that emits an optional field
// as `null` (small local models do this constantly) doesn't trip the AI SDK's
// pre-execute input validation, which rejects null against `.optional()` and
// surfaces a raw "Type validation failed" the model rarely recovers from. The
// MCP surface does the same via stripNulls() in routes/mcpRoutes.ts before it
// reaches the tool, so this is the chat-path equivalent.
function stripNullValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullValues);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== null) out[key] = stripNullValues(val);
    }
    return out;
  }
  return value;
}

// Applies chat-provider tuning that only matters when the tools are sent to an
// LLM provider through the AI SDK. The MCP surface skips this — MCP publishes
// the schemas over JSON-RPC where strict-mode flags and Anthropic cache
// markers are meaningless.
function applyChatProviderTuning(tools: ToolMap): void {
  // Null-tolerant input: wrap each published schema so null-valued optional
  // fields are stripped before validation. z.preprocess preserves the emitted
  // JSON schema (object type, properties, enums) the model sees — only the
  // runtime parse changes. Chat-only: MCP strips nulls upstream itself.
  for (const name of Object.keys(tools)) {
    const t = tools[name] as Tool & { inputSchema?: unknown };
    if (t.inputSchema) {
      t.inputSchema = z.preprocess(
        stripNullValues,
        t.inputSchema as z.ZodType
      ) as unknown as typeof t.inputSchema;
    }
  }
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
 *
 * `categories` is an optional, already-validated runtime tool-category
 * selection (see @workspace/shared). When present and non-empty it defines the
 * composed tool set; otherwise the profile's default set is used.
 */
export function buildChatbotTools(
  userId: string,
  tz: string,
  profile: ChatToolProfile = 'full',
  providerTuning = true,
  categories?: readonly string[]
): ToolMap {
  // Normalize the selection into the cache key so two requests with different
  // category sets don't share a memoized map. Sorted for order-independence.
  const validCategories = (categories ?? []).filter(isChatToolCategorySlug);
  const categoryKey =
    validCategories.length > 0 ? [...validCategories].sort().join(',') : 'all';
  const key = `${providerTuning ? 'chat' : 'mcp'}|${profile}|${categoryKey}|${tz}|${userId}`;
  const now = Date.now();
  const cached = toolCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.tools;
  }

  const tools = composeTools(userId, tz, profile, categories);
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
