import { describe, expect, it } from 'vitest';
import {
  buildMetaTools,
  ENABLE_TOOLS_TOOL_NAME,
} from '../ai/tools/metaTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

describe('sparky_enable_tools', () => {
  const tools = buildMetaTools();

  it('is published under the expected tool name', () => {
    expect(Object.keys(tools)).toEqual([ENABLE_TOOLS_TOOL_NAME]);
  });

  it('confirms a valid single-category request', async () => {
    const result = await tools[ENABLE_TOOLS_TOOL_NAME].execute!(
      { categories: ['exercise'] },
      opts
    );
    expect(result).toBe(
      "Enabled tool categories: exercise. The tools are now available — continue with the user's request."
    );
  });

  it('confirms and de-duplicates a multi-category request', async () => {
    const result = await tools[ENABLE_TOOLS_TOOL_NAME].execute!(
      { categories: ['food', 'reports', 'food'] },
      opts
    );
    expect(result).toBe(
      "Enabled tool categories: food, reports. The tools are now available — continue with the user's request."
    );
  });

  it('returns a validation error for an unknown category slug', async () => {
    const result = await tools[ENABLE_TOOLS_TOOL_NAME].execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { categories: ['bogus'] as any },
      opts
    );
    expect(result).toMatch(/^Error \[VALIDATION\]: categories\.0:/);
  });

  it('returns a validation error for an empty category list', async () => {
    const result = await tools[ENABLE_TOOLS_TOOL_NAME].execute!(
      { categories: [] },
      opts
    );
    expect(result).toMatch(/^Error \[VALIDATION\]: categories:/);
  });
});
