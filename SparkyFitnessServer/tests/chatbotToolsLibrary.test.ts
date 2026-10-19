import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildFoodLibraryTools } from '../ai/tools/foodLibraryTools.js';
import * as library from '../services/foodAssistantLibraryService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
vi.mock('../services/foodAssistantLibraryService.js', () => ({
  inspectFood: vi.fn(),
  previewFood: vi.fn(),
  publishFood: vi.fn(),
  undoFood: vi.fn(),
  importLibraryFood: vi.fn(),
}));
const id = randomUUID(),
  text = 'Use the label I supplied';
const tool = () =>
  buildFoodLibraryTools('signed-in-owner', { latestUserText: text })
    .sparky_food_library;
function run(raw: unknown) {
  const handler = tool();
  return handler.execute!(
    raw as Parameters<NonNullable<typeof handler.execute>>[0],
    toolOpts
  );
}
beforeEach(() => vi.clearAllMocks());
it('publishes a flat schema and validates versioned, action-specific commands before writing', async () => {
  expect(
    (tool().inputSchema as z.ZodType).safeParse({
      action: 'inspect_food',
      food_id: id,
    }).success
  ).toBe(true);
  expect(
    String(
      await run({
        action: 'publish_food',
        task_id: id,
        publish: { operation_id: id },
      })
    )
  ).toMatch(/expected_version|validation/i);
  expect(library.publishFood).not.toHaveBeenCalled();
});
it('pins publication to the actor and trusted current user text', async () => {
  const publish = { operation_id: id, expected_version: 1, source_quote: text };
  await run({ action: 'publish_food', task_id: id, publish });
  expect(library.publishFood).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    publish,
    text
  );
  expect(
    String(
      await run({ action: 'publish_food', task_id: id, publish, user_id: id })
    )
  ).toMatch(/validation|unrecognized/i);
  expect(library.publishFood).toHaveBeenCalledTimes(1);
});
it('passes exact provider identities and servings without rewriting nutrition', async () => {
  const command = {
    operation_id: id,
    expected_version: 1,
    ingredient_id: id,
    provider_type: 'fatsecret',
    external_id: '38820',
    serving_id: '38632',
  };
  await run({ action: 'import_provider_food', task_id: id, import: command });
  expect(library.importLibraryFood).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    command
  );
});
it('returns a failure without a completion claim when readback fails', async () => {
  vi.mocked(library.publishFood).mockRejectedValue(
    new Error('Readback failed')
  );
  expect(
    String(
      await run({
        action: 'publish_food',
        task_id: id,
        publish: { operation_id: id, expected_version: 1, source_quote: text },
      })
    )
  ).toMatch(/failed|error/i);
});
