import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { buildChatbotTools } from '../ai/tools/index.js';
import { buildDevTools } from '../ai/tools/devTools.js';
import {
  MCP_TOOL_READ_ACCESS,
  isReadOnlyTool,
  isToolAvailableReadOnly,
  isToolCallAllowedReadOnly,
} from '../ai/mcp/toolAccess.js';

// Same load-time workaround as tests/mcpRoutes.test.ts.
vi.mock('../services/foodEntryService', () => ({
  default: { getFoodEntriesByDateRange: vi.fn() },
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

interface PublishedSchema {
  properties?: Record<string, PublishedSchema>;
  enum?: unknown[];
  const?: unknown;
  anyOf?: PublishedSchema[];
  oneOf?: PublishedSchema[];
}
function publishedActions(schema: PublishedSchema): string[] {
  const action = schema.properties?.action;
  const direct =
    typeof action?.const === 'string'
      ? [action.const]
      : (action?.enum ?? []).filter(
          (value): value is string => typeof value === 'string'
        );
  return [
    ...new Set([
      ...direct,
      ...(schema.anyOf ?? schema.oneOf ?? []).flatMap(publishedActions),
    ]),
  ];
}
function actionValues(tool: unknown): string[] | null {
  const schema = (tool as { inputSchema?: z.ZodType }).inputSchema;
  if (!schema) return null;
  const actions = publishedActions(
    z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as PublishedSchema
  );
  return actions.length ? actions : null;
}

const ALL_TOOLS: Record<string, unknown> = {
  ...buildChatbotTools('user', 'UTC', 'full', false),
  ...buildDevTools('user'),
};

describe('MCP_TOOL_READ_ACCESS (#2678)', () => {
  it('only names tools that exist', () => {
    for (const name of Object.keys(MCP_TOOL_READ_ACCESS)) {
      expect(ALL_TOOLS, name).toHaveProperty(name);
    }
  });

  it('only names actions that exist, and only on tools with an action', () => {
    for (const [name, access] of Object.entries(MCP_TOOL_READ_ACCESS)) {
      if (access === 'read') continue;
      const actions = actionValues(ALL_TOOLS[name]);
      expect(actions, `${name} has an action enum`).not.toBeNull();
      for (const action of access) {
        expect(actions, `${name}.${action}`).toContain(action);
      }
      // A list that names every action would be a fully read-only tool.
      expect(access.length, name).toBeLessThan(actions!.length);
    }
  });

  it('treats unknown tools and unknown actions as writes', () => {
    expect(isToolAvailableReadOnly('sparky_not_a_tool')).toBe(false);
    expect(isToolCallAllowedReadOnly('sparky_not_a_tool', {})).toBe(false);
    expect(
      isToolCallAllowedReadOnly('sparky_manage_food', { action: 'log_food' })
    ).toBe(false);
    expect(isToolCallAllowedReadOnly('sparky_manage_food', {})).toBe(false);
    expect(
      isToolCallAllowedReadOnly('sparky_manage_food', { action: 'list_diary' })
    ).toBe(true);
    expect(isToolCallAllowedReadOnly('sparky_get_food_diary', {})).toBe(true);
  });

  it('keeps known writers away from read-only keys', () => {
    expect(isToolAvailableReadOnly('sparky_log_food_photo')).toBe(false);
    for (const [tool, action] of [
      ['sparky_manage_food', 'delete_entry'],
      ['sparky_manage_exercise', 'delete_exercise_entry'],
      ['sparky_manage_medications', 'delete_medication'],
      ['sparky_manage_workout_plans', 'delete_workout_plan'],
      ['sparky_get_sleep_science', 'recalculate_baseline'],
    ] as const) {
      expect(isToolCallAllowedReadOnly(tool, { action }), action).toBe(false);
    }
    expect(isReadOnlyTool('sparky_manage_food')).toBe(false);
    expect(isReadOnlyTool('sparky_get_food_diary')).toBe(true);
  });
});

it('keeps recipe reads available while denying recipe writes to read-only keys', () => {
  expect(
    isToolCallAllowedReadOnly('sparky_manage_recipes', { action: 'get_recipe' })
  ).toBe(true);
  expect(
    isToolCallAllowedReadOnly('sparky_manage_recipes', {
      action: 'preview_recipe',
    })
  ).toBe(true);
  expect(
    isToolCallAllowedReadOnly('sparky_manage_recipes', {
      action: 'publish_recipe',
    })
  ).toBe(false);
  expect(
    isToolCallAllowedReadOnly('sparky_manage_recipes', {
      action: 'remove_recipe_ingredient',
    })
  ).toBe(false);
});
