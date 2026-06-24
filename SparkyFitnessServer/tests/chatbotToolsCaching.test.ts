import { vi, describe, expect, it } from 'vitest';
import { buildChatbotTools } from '../ai/tools/index.js';

// Loading the real foodEntryService trips on a deep '@workspace/shared'
// subpath import; this surface test never executes handlers.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

describe('buildChatbotTools Anthropic prompt caching', () => {
  // Scope: this guards *our builder's* registry ordering — that exactly one
  // tool carries the cache breakpoint, it is the last in build order, and the
  // marker is well-formed. It does NOT prove the AI SDK emits that tool last to
  // Anthropic; that invariant is covered by the Object.entries/for…of source
  // verification plus the manual end-to-end cache-hit check.
  it('marks only the final tool as an ephemeral cache breakpoint', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    const entries = Object.entries(tools);
    const lastKey = entries[entries.length - 1][0];

    for (const [name, tool] of entries) {
      const cacheControl = (
        tool.providerOptions?.anthropic as
          | { cacheControl?: unknown }
          | undefined
      )?.cacheControl;

      if (name === lastKey) {
        expect(cacheControl, `${name} cacheControl`).toEqual({
          type: 'ephemeral',
        });
      } else {
        expect(cacheControl, `${name} cacheControl`).toBeUndefined();
      }
    }
  });
});
