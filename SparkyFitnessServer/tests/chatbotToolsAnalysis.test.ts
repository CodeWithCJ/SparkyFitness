import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildFoodAnalysisTools } from '../ai/tools/foodAnalysisTools.js';
import * as service from '../services/foodAssistantAnalysisService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
vi.mock('../services/foodAssistantAnalysisService.js', () => ({
  analyzeNutrition: vi.fn(),
  saveNutritionAnalysis: vi.fn(),
}));
const id = randomUUID();
const tool = () =>
  buildFoodAnalysisTools('signed-in-owner', 'Europe/London')
    .sparky_food_analysis;
function run(raw: unknown) {
  const handler = tool();
  return handler.execute!(
    raw as Parameters<NonNullable<typeof handler.execute>>[0],
    toolOpts
  );
}
beforeEach(() => vi.clearAllMocks());
it('exposes a flat schema and pins history and timezone to the actor', async () => {
  const analysis = {
    start_date: '2020-01-01',
    end_date: '2020-01-07',
    nutrients: ['calories'],
  };
  expect(
    (tool().inputSchema as z.ZodType).safeParse({ action: 'analyze', analysis })
      .success
  ).toBe(true);
  await run({ action: 'analyze', analysis });
  expect(service.analyzeNutrition).toHaveBeenCalledWith(
    'signed-in-owner',
    'Europe/London',
    analysis
  );
  expect(
    String(await run({ action: 'analyze', analysis, user_id: id }))
  ).toMatch(/validation|unrecognized/i);
  expect(service.analyzeNutrition).toHaveBeenCalledTimes(1);
});
it('requires a current version to save the analysis and catches read failures', async () => {
  expect(
    String(
      await run({
        action: 'save_analysis',
        task_id: id,
        command: { operation_id: id },
      })
    )
  ).toMatch(/validation|expected_version/i);
  expect(service.saveNutritionAnalysis).not.toHaveBeenCalled();
  vi.mocked(service.analyzeNutrition).mockRejectedValue(
    new Error('Snapshot unavailable')
  );
  expect(
    String(
      await run({
        action: 'analyze',
        analysis: { start_date: '2020-01-01', end_date: '2020-01-07' },
      })
    )
  ).toMatch(/error|unavailable/i);
});
