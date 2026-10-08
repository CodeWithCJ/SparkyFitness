import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildFoodPlanningTools } from '../ai/tools/foodPlanningTools.js';
import * as plans from '../services/foodAssistantPlanService.js';
import * as shopping from '../services/foodAssistantShoppingService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
vi.mock('../services/foodAssistantPlanService.js', () => ({
  inspectPlan: vi.fn(),
  previewPlan: vi.fn(),
  publishPlan: vi.fn(),
  undoPlan: vi.fn(),
}));
vi.mock('../services/foodAssistantShoppingService.js', () => ({
  buildShopping: vi.fn(),
  changeShopping: vi.fn(),
  undoShopping: vi.fn(),
}));
const id = randomUUID();
const tool = () =>
  buildFoodPlanningTools('signed-in-owner', 'Europe/London', {
    latestUserText: 'Confirm replace shown plan',
  }).sparky_food_planning;
function run(raw: unknown, options = toolOpts) {
  const handler = tool();
  return handler.execute!(
    raw as Parameters<NonNullable<typeof handler.execute>>[0],
    options
  );
}
beforeEach(() => vi.clearAllMocks());
it('publishes a flat action schema and validates strict commands before execution', async () => {
  const input = tool().inputSchema as z.ZodType;
  expect(
    input.safeParse({
      action: 'publish_plan',
      task_id: id,
      publish: { operation_id: id, expected_version: 1, schedule: true },
    }).success
  ).toBe(true);
  const result = await run(
    {
      action: 'publish_plan',
      task_id: id,
      publish: { operation_id: id, schedule: true },
    },
    toolOpts
  );
  expect(String(result)).toMatch(/validation|expected_version/i);
  expect(plans.publishPlan).not.toHaveBeenCalled();
});
it('pins owner, timezone and current user evidence for publication', async () => {
  const publish = {
    operation_id: id,
    expected_version: 1,
    schedule: true,
    confirmation_quote: 'Confirm replace shown plan',
  };
  await run({ action: 'publish_plan', task_id: id, publish }, toolOpts);
  expect(plans.publishPlan).toHaveBeenCalledWith(
    'signed-in-owner',
    'Europe/London',
    id,
    publish,
    'Confirm replace shown plan'
  );
});
it('pins owner and current evidence for shopping removal and refuses caller owners', async () => {
  const change = {
    operation_id: id,
    expected_version: 2,
    change: {
      type: 'remove' as const,
      item_id: id,
      source_quote: 'Confirm replace shown plan',
    },
  };
  await run({ action: 'change_shopping_list', task_id: id, change }, toolOpts);
  expect(shopping.changeShopping).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    change,
    'Confirm replace shown plan'
  );
  const output = await run(
    { action: 'change_shopping_list', task_id: id, change, user_id: id },
    toolOpts
  );
  expect(String(output)).toMatch(/unrecognized|validation/i);
  expect(shopping.changeShopping).toHaveBeenCalledTimes(1);
});
it('returns a readable failure without claiming completion', async () => {
  vi.mocked(plans.previewPlan).mockRejectedValue(
    new Error('Source unavailable')
  );
  expect(
    String(await run({ action: 'preview_plan', task_id: id }, toolOpts))
  ).toMatch(/error|unavailable/i);
});
