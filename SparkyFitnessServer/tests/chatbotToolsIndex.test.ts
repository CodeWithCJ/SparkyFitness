import { vi, describe, expect, it } from 'vitest';
import { buildChatbotTools, buildChatToolSurface } from '../ai/tools/index.js';
import { ENABLE_TOOLS_TOOL_NAME } from '../ai/tools/metaTools.js';
import { ASK_USER_TOOL_NAME } from '@workspace/shared';

// Loading the real foodEntryService trips on a deep '@workspace/shared'
// subpath import; the registry surface test never executes handlers.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// The chat-visible tool surface: every MCP tool except the three dev tools
// (sparky_inspect_schema, sparky_get_user_info, sparky_get_db_stats),
// which are intentionally not ported.
const EXPECTED_TOOLS = [
  'sparky_analyze_food_image',
  'sparky_analyze_trends',
  'sparky_check_engagement',
  'sparky_daily_checkin_wizard',
  'sparky_detect_patterns',
  'sparky_generate_coaching_plan',
  'sparky_get_30_day_trends',
  'sparky_get_contextual_nudge',
  'sparky_get_daily_exercise_totals',
  'sparky_get_daily_report',
  'sparky_get_exercise_details',
  'sparky_get_exercise_diary',
  'sparky_get_exercise_progress',
  'sparky_get_exercise_usage',
  'sparky_get_food_details',
  'sparky_get_food_diary',
  'sparky_get_food_usage',
  'sparky_get_goal_snapshot',
  'sparky_get_health_summary',
  'sparky_get_logging_streak',
  'sparky_get_nutrition_summary',
  'sparky_get_recent_exercise_entries',
  'sparky_get_recent_food_entries',
  'sparky_get_report',
  'sparky_list_exercises',
  'sparky_list_foods',
  'sparky_manage_checkin',
  'sparky_manage_exercise',
  'sparky_manage_food',
  'sparky_manage_goals',
  'sparky_manage_habits',
  'sparky_manage_profile',
  'sparky_scan_label',
  'sparky_search_exercises',
  'sparky_search_foods',
];

// The 'core' profile (used for Ollama and other small/local models): the
// food, exercise, and measurement logging the system prompt centers on, plus
// goals (a coaching chat must answer "what are my goals?"), minus the
// analytics, coaching, vision, profile, habit, wizard, and report tools that
// weaker models struggle to drive and that inflate prefill cost.
const EXPECTED_CORE_TOOLS = [
  'sparky_get_daily_exercise_totals',
  'sparky_get_exercise_details',
  'sparky_get_exercise_diary',
  'sparky_get_exercise_progress',
  'sparky_get_exercise_usage',
  'sparky_get_food_details',
  'sparky_get_food_diary',
  'sparky_get_food_usage',
  'sparky_get_goal_snapshot',
  'sparky_get_nutrition_summary',
  'sparky_get_recent_exercise_entries',
  'sparky_get_recent_food_entries',
  'sparky_list_exercises',
  'sparky_list_foods',
  'sparky_manage_checkin',
  'sparky_manage_exercise',
  'sparky_manage_food',
  'sparky_manage_goals',
  'sparky_search_exercises',
  'sparky_search_foods',
];

describe('buildChatbotTools', () => {
  it('exposes exactly the MCP chat-visible tool surface', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    expect(Object.keys(tools).sort()).toEqual(EXPECTED_TOOLS);
  });

  it('defaults to the full profile', () => {
    const tools = buildChatbotTools('user-1', 'UTC', 'full');
    expect(Object.keys(tools).sort()).toEqual(EXPECTED_TOOLS);
  });

  it('exposes only the core logging tools for the core profile', () => {
    const tools = buildChatbotTools('user-1', 'UTC', 'core');
    expect(Object.keys(tools).sort()).toEqual(EXPECTED_CORE_TOOLS);
  });

  it('keeps the core profile a strict subset of the full surface', () => {
    const full = new Set(Object.keys(buildChatbotTools('user-1', 'UTC')));
    const core = Object.keys(buildChatbotTools('user-1', 'UTC', 'core'));
    expect(core.length).toBeLessThan(full.size);
    for (const name of core) {
      expect(full.has(name), `${name} missing from full surface`).toBe(true);
    }
  });

  it('still disables provider strict mode in the core profile', () => {
    const tools = buildChatbotTools('user-1', 'UTC', 'core');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.strict, `${name} strict`).toBe(false);
    }
  });

  it('gives every tool a description, an input schema, and an executor', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.description, `${name} description`).toBeTruthy();
      expect(t.inputSchema, `${name} inputSchema`).toBeDefined();
      expect(typeof t.execute, `${name} execute`).toBe('function');
    }
  });

  // OpenAI's Responses API treats an omitted strict flag as "attempt strict
  // mode", which forces models to fill every published property with
  // placeholder values that the per-action union validation then rejects.
  it('publishes every tool with provider strict mode disabled', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.strict, `${name} strict`).toBe(false);
    }
  });

  // Anthropic caches the request prefix up to and including the marked tool,
  // so the ephemeral breakpoint MUST land on the final tool of the composed
  // map (in both profiles) or the whole tool block silently stops caching.
  it('marks the last tool of each profile as the Anthropic cache breakpoint', () => {
    for (const profile of ['full', 'core'] as const) {
      const tools = buildChatbotTools('user-1', 'UTC', profile);
      const names = Object.keys(tools);
      const last = tools[names[names.length - 1]];
      expect(
        last.providerOptions?.anthropic?.cacheControl,
        `${profile} last tool cacheControl`
      ).toEqual({ type: 'ephemeral' });
      // And on no other tool — extra breakpoints waste Anthropic's 4-marker
      // budget.
      for (const name of names.slice(0, -1)) {
        expect(
          tools[name].providerOptions?.anthropic?.cacheControl,
          `${name} should not carry a cache breakpoint`
        ).toBeUndefined();
      }
    }
  });

  // The MCP surface (providerTuning=false) must publish clean schemas: no
  // strict flag, no Anthropic cache marker — those are chat/AI-SDK concerns.
  it('skips provider tuning when providerTuning is false', () => {
    const tools = buildChatbotTools('mcp-user', 'UTC', 'full', false);
    for (const [name, t] of Object.entries(tools)) {
      expect(t.strict, `${name} strict`).toBeUndefined();
      expect(
        t.providerOptions?.anthropic?.cacheControl,
        `${name} cacheControl`
      ).toBeUndefined();
    }
  });

  // Small local models routinely emit optional fields as null; the AI SDK
  // rejects null against `.optional()` before execute() runs. The chat surface
  // must strip nulls so those calls still reach the handler.
  it('strips null-valued optional fields from chat-tool input before validation', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tools.sparky_manage_food.inputSchema as any;
    const parsed = schema.safeParse({
      action: 'log_external_food',
      food_name: 'egg',
      external_id: null,
      quantity: 2,
      unit: 'piece',
      meal_type: 'breakfast',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.external_id).toBeUndefined();
    expect(parsed.data.food_name).toBe('egg');
  });

  // The MCP surface strips nulls upstream (routes/mcpRoutes.ts), so its
  // published schema stays a bare object and rejects an explicit null — the
  // chat-only preprocess wrapper must not leak into it.
  it('does not add the null-stripping wrapper to the MCP surface', () => {
    const tools = buildChatbotTools('mcp-user', 'UTC', 'full', false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tools.sparky_manage_food.inputSchema as any;
    const parsed = schema.safeParse({
      action: 'log_external_food',
      food_name: 'egg',
      external_id: null,
      meal_type: 'breakfast',
    });
    expect(parsed.success).toBe(false);
  });

  it('memoizes the tool map per user/tz/profile within the cache TTL', () => {
    const first = buildChatbotTools('memo-user', 'UTC', 'full');
    const second = buildChatbotTools('memo-user', 'UTC', 'full');
    expect(second).toBe(first);
    // Different key dimensions build fresh maps.
    expect(buildChatbotTools('memo-user', 'UTC', 'core')).not.toBe(first);
    expect(buildChatbotTools('other-user', 'UTC', 'full')).not.toBe(first);
    expect(buildChatbotTools('memo-user', 'UTC', 'full', false)).not.toBe(
      first
    );
  });

  // Runtime tool-category selection: an explicit, validated category list
  // defines the composed surface regardless of the full/core profile.
  describe('toolCategories selection', () => {
    it('composes only the food domain when categories=["food"]', () => {
      const tools = buildChatbotTools('cat-user', 'UTC', 'full', true, [
        'food',
      ]);
      const names = Object.keys(tools);
      expect(names).toContain('sparky_manage_food');
      expect(names).toContain('sparky_search_foods');
      // No other domain leaks in.
      expect(names.some((n) => n.includes('exercise'))).toBe(false);
      expect(names).not.toContain('sparky_manage_goals');
      expect(names).not.toContain('sparky_get_report');
    });

    it('unions multiple categories (food + reports) and drops others', () => {
      const names = Object.keys(
        buildChatbotTools('cat-user', 'UTC', 'full', true, ['food', 'reports'])
      );
      expect(names).toContain('sparky_manage_food');
      expect(names).toContain('sparky_get_report');
      expect(names.some((n) => n.includes('exercise'))).toBe(false);
    });

    it('reproduces the core surface when given the core category slugs', () => {
      const viaCategories = Object.keys(
        buildChatbotTools('cat-user', 'UTC', 'full', true, [
          'food',
          'exercise',
          'checkin',
          'goals',
        ])
      ).sort();
      const viaProfile = Object.keys(
        buildChatbotTools('cat-user2', 'UTC', 'core')
      ).sort();
      expect(viaCategories).toEqual(viaProfile);
    });

    it('ignores unknown slugs and falls back to the profile when none remain', () => {
      const bogusOnly = Object.keys(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buildChatbotTools('cat-user', 'UTC', 'full', true, ['bogus'] as any)
      ).sort();
      const fullProfile = Object.keys(
        buildChatbotTools('cat-user3', 'UTC', 'full')
      ).sort();
      expect(bogusOnly).toEqual(fullProfile);
    });

    it('keys the memo cache on the category set', () => {
      const foodOnly = buildChatbotTools('memo-cat', 'UTC', 'full', true, [
        'food',
      ]);
      expect(buildChatbotTools('memo-cat', 'UTC', 'full', true, ['food'])).toBe(
        foodOnly
      );
      // A different category set is a different cache entry.
      expect(
        buildChatbotTools('memo-cat', 'UTC', 'full', true, ['exercise'])
      ).not.toBe(foodOnly);
      // Order-independent: same set in a different order hits the same entry.
      expect(
        buildChatbotTools('memo-cat2', 'UTC', 'full', true, ['food', 'goals'])
      ).toBe(
        buildChatbotTools('memo-cat2', 'UTC', 'full', true, ['goals', 'food'])
      );
    });

    it('still marks the last composed tool as the Anthropic cache breakpoint', () => {
      const tools = buildChatbotTools('cat-user', 'UTC', 'full', true, [
        'food',
      ]);
      const names = Object.keys(tools);
      const last = tools[names[names.length - 1]];
      expect(last.providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
    });
  });
});

// buildChatToolSurface backs the chat (not MCP) path: it always composes the
// full tool map plus the two chat-only tools (sparky_ask_user quick replies and
// the sparky_enable_tools escalation tool), and callers narrow per-request via
// the AI SDK's activeTools instead of recomposing.
describe('buildChatToolSurface', () => {
  it('includes every domain tool plus the chat-only tools, with the escalation tool last', () => {
    const { tools } = buildChatToolSurface('surface-user', 'UTC');
    const names = Object.keys(tools);
    // Composition order mirrors CATEGORY_ORDER, not alphabetical, so compare
    // as sets; only the trailing position of the escalation tool is order-
    // sensitive (it's what the Anthropic cache breakpoint anchors to).
    expect(names.slice(0, -1).sort()).toEqual(
      [...EXPECTED_TOOLS, ASK_USER_TOOL_NAME].sort()
    );
    expect(names[names.length - 1]).toBe(ENABLE_TOOLS_TOOL_NAME);
  });

  // sparky_ask_user belongs to no category, so a category selection can never
  // pull it in — chatService adds it to activeTools explicitly (full profile
  // only). If it ever leaked into a category, 'core' would start shipping it.
  it('keeps sparky_ask_user out of the per-category name index', () => {
    const { toolNamesByCategory } = buildChatToolSurface('surface-user', 'UTC');
    for (const names of Object.values(toolNamesByCategory)) {
      expect(names).not.toContain(ASK_USER_TOOL_NAME);
    }
  });

  it('marks only sparky_enable_tools as the Anthropic cache breakpoint', () => {
    const { tools } = buildChatToolSurface('surface-user', 'UTC');
    const names = Object.keys(tools);
    expect(
      tools[ENABLE_TOOLS_TOOL_NAME].providerOptions?.anthropic?.cacheControl
    ).toEqual({ type: 'ephemeral' });
    for (const name of names.slice(0, -1)) {
      expect(
        tools[name].providerOptions?.anthropic?.cacheControl,
        `${name} should not carry a cache breakpoint`
      ).toBeUndefined();
    }
  });

  it('applies chat provider tuning (strict disabled) to every tool including the escalation tool', () => {
    const { tools } = buildChatToolSurface('surface-user', 'UTC');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.strict, `${name} strict`).toBe(false);
    }
  });

  it('indexes every composed tool name under exactly one category', () => {
    const { toolNamesByCategory } = buildChatToolSurface('surface-user', 'UTC');
    const indexed = Object.values(toolNamesByCategory).flat();
    // Every domain tool (i.e. every tool except the escalation tool) is
    // indexed exactly once.
    expect(indexed.sort()).toEqual(EXPECTED_TOOLS.slice().sort());
    expect(new Set(indexed).size).toBe(indexed.length);
  });

  it('memoizes per user/tz and returns a fresh surface for a different key', () => {
    const first = buildChatToolSurface('memo-surface', 'UTC');
    const second = buildChatToolSurface('memo-surface', 'UTC');
    expect(second).toBe(first);
    expect(buildChatToolSurface('other-surface', 'UTC')).not.toBe(first);
    expect(buildChatToolSurface('memo-surface', 'America/New_York')).not.toBe(
      first
    );
  });
});
