import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  foodAssistantTaskSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import * as tasks from '../models/foodAssistantRepository.js';
import * as plans from '../models/foodAssistantPlanRepository.js';
import type { PlanSnapshot } from '../models/foodAssistantPlanRepository.js';
import type { DiarySelection } from '../models/foodAssistantDiaryRepository.js';
import * as service from '../services/foodAssistantPlanService.js';
import * as writer from '../services/foodAssistantDiaryService.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import goalService from '../services/goalService.js';
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  getTask: vi.fn(),
  listPreferences: vi.fn(),
  mutateTask: vi.fn(),
}));
vi.mock('../models/foodAssistantPlanRepository.js', async (original) => ({
  ...(await original<
    typeof import('../models/foodAssistantPlanRepository.js')
  >()),
  readPlan: vi.fn(),
  readPlanDiary: vi.fn(),
  writePlan: vi.fn(),
  removePlanDiary: vi.fn(),
  deletePlan: vi.fn(),
}));
vi.mock('../services/foodAssistantDiaryService.js', async (original) => ({
  ...(await original<
    typeof import('../services/foodAssistantDiaryService.js')
  >()),
  writeVerifiedDiaryLog: vi.fn(),
  recomputeDiaryWater: vi.fn(),
  assertAbsentDiaryIdentities: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { getFoodById: vi.fn() },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: vi.fn() },
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoalsForRange: vi.fn() },
}));
const userId = randomUUID(),
  taskId = randomUUID(),
  foodId = randomUUID(),
  variantId = randomUUID(),
  ingredientId = randomUUID(),
  assignmentId = randomUUID(),
  mealType = randomUUID();
const client = {} as PoolClient;
let task: FoodAssistantTask, stored: PlanSnapshot | null, diary: DiarySelection;
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
  vi.clearAllMocks();
  stored = null;
  diary = { entries: [], meals: [], water: [] };
  task = foodAssistantTaskSchema.parse({
    id: taskId,
    user_id: userId,
    kind: 'meal_plan',
    title: 'Weekly bread',
    status: 'draft',
    version: 1,
    creation_hash: 'test',
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
    checkpoint: {
      summary: 'Plan bread',
      ingredients: [
        {
          id: ingredientId,
          description: 'White bread',
          quantity: 2,
          unit: 'slice',
          food_id: foodId,
          variant_id: variantId,
          status: 'verified',
        },
      ],
      plan: {
        name: 'Weekly bread',
        start_date: '2026-10-08',
        end_date: '2026-10-16',
        assignments: [
          {
            id: assignmentId,
            item_type: 'food',
            ingredient_id: ingredientId,
            meal_type_id: mealType,
            day_of_week: 5,
          },
        ],
      },
    },
  });
  vi.mocked(foodRepository.getFoodById).mockResolvedValue({
    id: foodId,
    name: 'White bread',
    variants: [
      {
        id: variantId,
        serving_size: 1,
        serving_unit: 'slice',
        calories: 80,
        protein: 3,
        carbs: 15,
        fat: 1,
        source: 'imported',
      },
    ],
  });
  vi.mocked(tasks.getTask).mockImplementation(async () =>
    structuredClone(task)
  );
  vi.mocked(tasks.listPreferences).mockResolvedValue([]);
  vi.mocked(goalService.getUserGoalsForRange).mockResolvedValue({
    '2026-10-09': { calories: 1800 },
  });
  vi.mocked(plans.readPlan).mockImplementation(async () =>
    structuredClone(stored)
  );
  vi.mocked(plans.readPlanDiary).mockImplementation(async () =>
    structuredClone(diary)
  );
  vi.mocked(plans.writePlan).mockImplementation(
    async (_client, owner, value) => {
      expect(owner).toBe(userId);
      stored = structuredClone(value);
    }
  );
  vi.mocked(tasks.mutateTask).mockImplementation(
    async (owner, command, callback) => {
      expect(owner).toBe(userId);
      const oldTask = structuredClone(task),
        oldPlan = structuredClone(stored),
        oldDiary = structuredClone(diary);
      try {
        task = { ...(await callback(task, client)), version: task.version + 1 };
        return {
          id: command.operationId,
          user_id: userId,
          task_id: taskId,
          kind: command.kind,
          request_hash: 'test',
          before_state: json(oldTask),
          after_state: json(task),
          created_at: new Date(),
        };
      } catch (error) {
        task = oldTask;
        stored = oldPlan;
        diary = oldDiary;
        throw error;
      }
    }
  );
  vi.mocked(writer.writeVerifiedDiaryLog).mockImplementation(
    async (owner, transaction, input) => {
      expect(owner).toBe(userId);
      expect(transaction).toBe(client);
      const entries = input.snapshots.map((row) => ({
        ...row,
        id: randomUUID(),
        user_id: userId,
        entry_date: input.destination.date,
        meal_type_id: input.destination.meal_type_id,
        meal_plan_template_id: input.template_id ?? null,
      }));
      diary.entries.push(...entries);
      return { entries, meals: [], water: [] };
    }
  );
});
afterEach(() => vi.useRealTimers());
function publish(extra: Record<string, unknown> = {}, text?: string) {
  return service.publishPlan(
    userId,
    'Europe/London',
    taskId,
    {
      operation_id: randomUUID(),
      expected_version: task.version,
      schedule: true,
      ...extra,
    },
    text
  );
}
describe('verified meal plan publication', () => {
  it('previews actual daily nutrition and the requested date goals, keeping unknowns null', async () => {
    const preview = await service.previewPlan(userId, taskId);
    expect(preview.daily_nutrition).toEqual([
      {
        date: '2026-10-09',
        nutrition: expect.objectContaining({ calories: 160, sodium: null }),
      },
      {
        date: '2026-10-16',
        nutrition: expect.objectContaining({ calories: 160 }),
      },
    ]);
    expect(goalService.getUserGoalsForRange).toHaveBeenCalledWith(
      userId,
      '2026-10-08',
      '2026-10-16'
    );
    expect(preview.goals).toEqual({ '2026-10-09': { calories: 1800 } });
    expect(plans.writePlan).not.toHaveBeenCalled();
  });
  it('publishes all future occurrences with the same verified writer and captured shopping quantities', async () => {
    await publish();
    expect(writer.writeVerifiedDiaryLog).toHaveBeenCalledTimes(2);
    expect(diary.entries.map((row) => row.entry_date)).toEqual([
      '2026-10-09',
      '2026-10-16',
    ]);
    expect(task.result).toMatchObject({
      kind: 'meal_plan',
      after_diary: {
        entries: expect.arrayContaining([
          expect.objectContaining({ quantity: 2, calories: 80 }),
        ]),
      },
      shopping_sources: expect.arrayContaining([
        {
          date: '2026-10-09',
          foods: expect.arrayContaining([
            expect.objectContaining({ quantity: 2 }),
          ]),
        },
      ]),
    });
  });
  it('can save an inactive template without logging anything', async () => {
    await publish({ schedule: false });
    expect(stored?.plan.is_active).toBe(false);
    expect(writer.writeVerifiedDiaryLog).not.toHaveBeenCalled();
  });
  it('rejects incomplete ingredients, stale linked recipes, and implausible source nutrition before any writes', async () => {
    task.checkpoint.ingredients[0] = {
      ...task.checkpoint.ingredients[0]!,
      status: 'unresolved',
      issue: 'Need label',
    };
    await expect(publish()).rejects.toThrow('Need label');
    expect(plans.writePlan).not.toHaveBeenCalled();
    task.checkpoint.ingredients[0] = {
      ...task.checkpoint.ingredients[0]!,
      status: 'verified',
    };
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: foodId,
      name: 'White bread',
      variants: [
        {
          id: variantId,
          serving_size: 1,
          serving_unit: 'slice',
          calories: 2.5,
          protein: 0.1,
          carbs: 0.2,
          fat: 0.1,
        },
      ],
    });
    await expect(publish()).rejects.toThrow('bread');
    expect(plans.writePlan).not.toHaveBeenCalled();
    task.checkpoint.ingredients = [];
    task.checkpoint.plan!.assignments = [
      {
        id: assignmentId,
        item_type: 'meal',
        meal_type_id: mealType,
        day_of_week: 5,
        meal_id: foodId,
        quantity: 1,
        unit: 'serving',
        expected_recipe_updated_at: '2026-10-08T00:00:00Z',
      },
    ];
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      id: foodId,
      user_id: userId,
      name: 'Recipe',
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 1,
      updated_at: new Date('2026-10-09T00:00:00Z'),
      foods: [
        {
          id: ingredientId,
          food_id: foodId,
          variant_id: variantId,
          food_name: 'Bread',
          quantity: 1,
          unit: 'slice',
        },
      ],
    });
    await expect(publish()).rejects.toThrow('changed');
    expect(plans.writePlan).not.toHaveBeenCalled();
  });
  it('rolls back the template and earlier entries if any scheduled write or readback fails', async () => {
    vi.mocked(writer.writeVerifiedDiaryLog).mockRejectedValueOnce(
      new Error('Injected failure')
    );
    await expect(publish()).rejects.toThrow('Injected failure');
    expect(stored).toBeNull();
    expect(diary.entries).toEqual([]);
    expect(task.status).toBe('draft');
    vi.mocked(plans.readPlan).mockImplementation(async () =>
      stored ? { ...stored, assignments: [] } : null
    );
    await expect(publish()).rejects.toThrow('Persisted plan');
    expect(stored).toBeNull();
    expect(diary.entries).toEqual([]);
  });
  it('refuses stale inspected plans and unconfirmed replacement of future rows', async () => {
    await publish();
    const planId = String(stored!.plan.id),
      current = structuredClone(stored!);
    task = { ...task, status: 'draft', result: null };
    await expect(
      publish({ plan_id: planId, expected_fingerprint: 'a'.repeat(64) })
    ).rejects.toThrow('changed');
    await expect(
      publish({
        plan_id: planId,
        expected_fingerprint: service.planFingerprint(current, diary),
      })
    ).rejects.toThrow('confirmation');
    expect(plans.removePlanDiary).not.toHaveBeenCalled();
  });
  it('refuses a wholly historical or nonmatching scheduled window and enforces bounded expansion', async () => {
    task.checkpoint.plan!.end_date = '2026-10-08';
    await expect(publish()).rejects.toThrow('no occurrences');
    task.checkpoint.plan!.end_date = '2027-01-16';
    await expect(publish()).rejects.toThrow('90 days');
    expect(plans.writePlan).not.toHaveBeenCalled();
  });
  it('refuses undo after a scheduled entry changes', async () => {
    const operation = await publish();
    diary.entries[0] = { ...diary.entries[0]!, quantity: 4 };
    await expect(
      service.undoPlan(
        userId,
        taskId,
        {
          operation_id: randomUUID(),
          expected_version: task.version,
          publication_operation_id: operation.id,
          source_quote: 'Undo plan',
        },
        'Undo plan'
      )
    ).rejects.toThrow('newer work');
    expect(plans.deletePlan).not.toHaveBeenCalled();
  });
});
