import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  foodAssistantTaskSchema,
  foodAssistantShoppingResultSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import type { PoolClient } from 'pg';
import * as tasks from '../models/foodAssistantRepository.js';
import * as service from '../services/foodAssistantShoppingService.js';
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  mutateTask: vi.fn(),
  getTask: vi.fn(),
  getOperation: vi.fn(),
}));
const userId = randomUUID(),
  taskId = randomUUID(),
  foodId = randomUUID(),
  otherId = randomUUID(),
  itemId = randomUUID();
let task: FoodAssistantTask;
const command = () => ({
  operation_id: randomUUID(),
  expected_version: task.version,
});
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
beforeEach(() => {
  vi.clearAllMocks();
  task = foodAssistantTaskSchema.parse({
    id: taskId,
    user_id: userId,
    kind: 'shopping',
    title: 'Weekly list',
    status: 'draft',
    version: 1,
    creation_hash: 'test',
    checkpoint: { summary: 'Make shopping list' },
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
  vi.mocked(tasks.mutateTask).mockImplementation(
    async (owner, mutation, callback) => {
      expect(owner).toBe(userId);
      const before = structuredClone(task);
      task = {
        ...(await callback(task, {} as PoolClient)),
        version: task.version + 1,
      };
      return {
        id: mutation.operationId,
        user_id: userId,
        task_id: taskId,
        kind: mutation.kind,
        request_hash: 'test',
        before_state: json(before),
        after_state: json(task),
        created_at: new Date(),
      };
    }
  );
});
const food = (quantity: number, unit: string, id = foodId) => ({
  food_id: id,
  food_name: 'Flour',
  quantity,
  unit,
});
describe('shopping quantities and source completeness', () => {
  it('combines compatible metric units and subtracts pantry exactly once', () => {
    const items = service.aggregateShoppingItems(
      [food(500, 'g'), food(1, 'kg')],
      [{ food_id: foodId, quantity: 0.25, unit: 'kg' }],
      taskId
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      quantity: 1250,
      required_quantity: 1500,
      pantry_quantity: 250,
      unit: 'g',
      purchased: false,
    });
    expect(
      service.aggregateShoppingItems(
        [food(500, 'g'), food(1, 'kg')],
        [],
        taskId
      )[0]?.id
    ).toBe(items[0]?.id);
  });
  it('keeps sizes, incompatible units and distinct food identities separate', () => {
    const items = service.aggregateShoppingItems(
      [
        food(2, 'large slices'),
        food(3, 'slice'),
        food(20, 'g'),
        food(50, 'ml'),
        food(100, 'g', otherId),
      ],
      [{ food_id: foodId, quantity: 1, unit: 'slice' }],
      taskId
    );
    expect(items).toHaveLength(5);
    expect(items.find((item) => item.unit === 'slice large')?.quantity).toBe(2);
    expect(items.find((item) => item.unit === 'slice')?.quantity).toBe(2);
    expect(items.find((item) => item.food_id === otherId)?.quantity).toBe(100);
  });
  it('caps pantry deduction at the required amount without inventing count weights', () => {
    const items = service.aggregateShoppingItems(
      [food(2, 'slice')],
      [
        { food_id: foodId, quantity: 999, unit: 'g' },
        { food_id: foodId, quantity: 4, unit: 'slice' },
      ],
      taskId
    );
    expect(items[0]).toMatchObject({
      quantity: 0,
      required_quantity: 2,
      pantry_quantity: 2,
    });
  });
  it('builds a saved standalone list and merges explicit extras with captured plan quantities', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue({
      ...task,
      kind: 'meal_plan',
      status: 'complete',
      result: {
        kind: 'meal_plan',
        shopping_sources: [
          { date: '2026-10-09', foods: [food(1, 'kg')] },
          { date: '2026-10-10', foods: [food(2, 'kg')] },
        ],
      },
    });
    await service.buildShopping(userId, taskId, {
      ...command(),
      plan_task_id: otherId,
      start_date: '2026-10-09',
      end_date: '2026-10-09',
      items: [{ name: 'Flour', food_id: foodId, quantity: 250, unit: 'g' }],
    });
    expect(
      foodAssistantShoppingResultSchema.parse(task.result).items[0]
    ).toMatchObject({ quantity: 1.25, unit: 'kg' });
    expect(tasks.getTask).toHaveBeenCalledWith(
      userId,
      otherId,
      expect.anything()
    );
  });
  it('rejects missing, undone or uncompleted source plans and reversed dates', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(null);
    await expect(
      service.buildShopping(userId, taskId, {
        ...command(),
        plan_task_id: otherId,
      })
    ).rejects.toThrow('completed plan');
    vi.mocked(tasks.getTask).mockResolvedValue({
      ...task,
      status: 'complete',
      result: { kind: 'meal_plan_undo' },
    });
    await expect(
      service.buildShopping(userId, taskId, {
        ...command(),
        plan_task_id: otherId,
      })
    ).rejects.toThrow('completed plan');
    await expect(
      service.buildShopping(userId, taskId, {
        ...command(),
        start_date: '2026-10-10',
        end_date: '2026-10-09',
        items: [{ name: 'Bread', quantity: 2, unit: 'slice' }],
      })
    ).rejects.toThrow('End date');
    expect(task.status).toBe('draft');
  });
});
function completed() {
  task = {
    ...task,
    status: 'complete',
    result: {
      kind: 'shopping',
      publication_operation_id: randomUUID(),
      plan_id: null,
      plan_task_id: null,
      items: [
        {
          id: itemId,
          food_id: foodId,
          name: 'Bread',
          quantity: 2,
          required_quantity: 2,
          pantry_quantity: 0,
          unit: 'slice',
          purchased: false,
        },
      ],
    },
  };
}
describe('recoverable shopping edits', () => {
  it('marks the selected persisted item then undoes only its audited operation', async () => {
    completed();
    const operation = await service.changeShopping(userId, taskId, {
      ...command(),
      change: { type: 'mark', item_id: itemId, purchased: true },
    });
    expect(
      foodAssistantShoppingResultSchema.parse(task.result).items[0]?.purchased
    ).toBe(true);
    vi.mocked(tasks.getOperation).mockResolvedValue(operation);
    await service.undoShopping(
      userId,
      taskId,
      {
        ...command(),
        shopping_operation_id: operation.id,
        source_quote: 'Undo the checkbox',
      },
      'Undo the checkbox'
    );
    expect(
      foodAssistantShoppingResultSchema.parse(task.result).items[0]?.purchased
    ).toBe(false);
  });
  it('refuses undo after another edit and refuses unrelated operations', async () => {
    completed();
    const operation = await service.changeShopping(userId, taskId, {
      ...command(),
      change: { type: 'mark', item_id: itemId, purchased: true },
    });
    await service.changeShopping(userId, taskId, {
      ...command(),
      change: { type: 'add', name: 'Milk', quantity: 1, unit: 'l' },
    });
    vi.mocked(tasks.getOperation).mockResolvedValue(operation);
    await expect(
      service.undoShopping(
        userId,
        taskId,
        {
          ...command(),
          shopping_operation_id: operation.id,
          source_quote: 'Undo',
        },
        'Undo'
      )
    ).rejects.toThrow('newer work');
    vi.mocked(tasks.getOperation).mockResolvedValue({
      ...operation,
      kind: 'checkpoint',
    });
    await expect(
      service.undoShopping(
        userId,
        taskId,
        {
          ...command(),
          shopping_operation_id: operation.id,
          source_quote: 'Undo',
        },
        'Undo'
      )
    ).rejects.toThrow('not found');
  });
  it('requires a current explicit removal quote and does not remove another item', async () => {
    completed();
    await expect(
      service.changeShopping(
        userId,
        taskId,
        {
          ...command(),
          change: {
            type: 'remove',
            item_id: itemId,
            source_quote: 'Remove bread',
          },
        },
        'Keep bread'
      )
    ).rejects.toThrow('current user');
    await expect(
      service.changeShopping(userId, taskId, {
        ...command(),
        change: { type: 'mark', item_id: otherId, purchased: true },
      })
    ).rejects.toThrow('not found');
    expect(
      foodAssistantShoppingResultSchema.parse(task.result).items
    ).toHaveLength(1);
  });
});
