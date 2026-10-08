import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  foodAssistantTaskSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import * as service from '../services/foodAssistantDiaryService.js';
import * as diary from '../models/foodAssistantDiaryRepository.js';
import type { DiarySnapshot } from '../models/foodAssistantDiaryRepository.js';
import * as tasks from '../models/foodAssistantRepository.js';
import foodRepository from '../models/foodRepository.js';
import * as meals from '../models/foodEntryMealRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import mealRepository from '../models/mealRepository.js';

vi.mock('../models/foodAssistantDiaryRepository.js', async (original) => ({
  ...(await original<
    typeof import('../models/foodAssistantDiaryRepository.js')
  >()),
  readSelection: vi.fn(),
  readSnapshots: vi.fn(),
  readLinkedWater: vi.fn(),
  insertSnapshot: vi.fn(),
  updateSnapshot: vi.fn(),
  deleteSnapshots: vi.fn(),
  hasOtherMealEntries: vi.fn(),
}));
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  mutateTask: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { getFoodById: vi.fn() },
}));
vi.mock('../models/foodEntryMealRepository.js', () => ({
  createFoodEntryMealWithClient: vi.fn(),
  resolveMealTypeIdWithClient: vi.fn(),
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: { recomputeWaterAggregate: vi.fn() },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: vi.fn() },
}));
const userId = randomUUID(),
  taskId = randomUUID(),
  oldId = randomUUID(),
  foodId = randomUUID(),
  variantId = randomUUID(),
  mealType = randomUUID(),
  parentId = randomUUID();
const client = { query: vi.fn() } as unknown as PoolClient;
type Table = 'food_entries' | 'food_entry_meals' | 'water_intake_entries';
let db: Record<Table, Map<string, DiarySnapshot>>, task: FoodAssistantTask;
const now = '2026-10-08T10:00:00.000Z';
function entry(extra: DiarySnapshot = {}): DiarySnapshot {
  return {
    id: oldId,
    user_id: userId,
    food_id: randomUUID(),
    variant_id: randomUUID(),
    quantity: 60,
    unit: 'g',
    serving_size: 100,
    serving_unit: 'g',
    food_name: 'Sourdough',
    brand_name: null,
    calories: 250,
    protein: 9,
    carbs: 45,
    fat: 2,
    entry_date: '2026-10-08',
    entry_time: '12:30:00',
    meal_type_id: mealType,
    meal_id: null,
    food_entry_meal_id: parentId,
    notes: 'Toasted',
    images: ['/uploads/toast.jpg'],
    allergens: ['gluten'],
    traces: null,
    custom_nutrients: { test: 4 },
    source: 'manual',
    source_id: null,
    created_at: now,
    created_by_user_id: userId,
    updated_by_user_id: userId,
    water_ml: null,
    ...extra,
  };
}
const bread = {
  id: foodId,
  name: 'White bread',
  brand: 'Test brand',
  variants: [
    {
      id: variantId,
      food_id: foodId,
      serving_size: 1,
      serving_unit: 'slice',
      calories: 80,
      protein: 3,
      carbs: 15,
      fat: 1,
      is_default: true,
      source: 'imported',
      allergens: ['gluten'],
    },
  ],
};
const scope = { type: 'entries' as const, ids: [oldId] };
const destination = { date: '2026-10-09', meal_type_id: mealType };
async function observed(selected = scope) {
  return (await service.inspectDiary(userId, selected)).fingerprint;
}
async function apply(action: unknown, text = 'Replace it') {
  return service.applyDiary(
    userId,
    taskId,
    { operation_id: randomUUID(), expected_version: task.version, action },
    text
  );
}
function rows(table: Table) {
  return [...db[table].values()];
}
beforeEach(() => {
  vi.clearAllMocks();
  db = {
    food_entries: new Map([[oldId, entry()]]),
    food_entry_meals: new Map([
      [
        parentId,
        {
          id: parentId,
          user_id: userId,
          entry_date: '2026-10-08',
          meal_type_id: mealType,
          entry_time: '12:30:00',
          name: 'Lunch',
          quantity: 1,
          unit: 'serving',
          images: [],
          notes: 'Meal note',
          created_at: now,
          updated_at: now,
        },
      ],
    ]),
    water_intake_entries: new Map(),
  };
  task = foodAssistantTaskSchema.parse({
    id: taskId,
    user_id: userId,
    kind: 'diary',
    title: 'Change lunch',
    status: 'draft',
    version: 1,
    creation_hash: 'test',
    checkpoint: { summary: 'Replace bread' },
    result: null,
    created_at: new Date(now),
    updated_at: new Date(now),
  });
  vi.mocked(foodRepository.getFoodById).mockResolvedValue(bread);
  vi.mocked(meals.resolveMealTypeIdWithClient).mockResolvedValue(mealType);
  vi.mocked(tasks.mutateTask).mockImplementation(
    async (_user, command, callback) => {
      const backup = structuredClone(db),
        previous = structuredClone(task);
      try {
        task = await callback(task, client);
        task = { ...task, version: task.version + 1 };
        return {
          id: command.operationId,
          user_id: userId,
          task_id: taskId,
          kind: command.kind,
          request_hash: 'test',
          before_state: z.json().parse(JSON.parse(JSON.stringify(previous))),
          after_state: z.json().parse(JSON.parse(JSON.stringify(task))),
          created_at: new Date(now),
        };
      } catch (error) {
        db = backup;
        task = previous;
        throw error;
      }
    }
  );
  vi.mocked(diary.readSelection).mockImplementation(async (_user, selected) => {
    const entries = rows('food_entries').filter((row) =>
      selected.type === 'entries'
        ? selected.ids.includes(String(row.id))
        : selected.type === 'logged_meal'
          ? row.food_entry_meal_id === selected.id
          : row.entry_date === selected.date &&
            row.meal_type_id === selected.meal_type_id
    );
    const parents = rows('food_entry_meals').filter((row) =>
      selected.type === 'logged_meal'
        ? row.id === selected.id
        : selected.type === 'meal_slot'
          ? row.entry_date === selected.date &&
            row.meal_type_id === selected.meal_type_id
          : entries.some((e) => e.food_entry_meal_id === row.id)
    );
    return structuredClone({
      entries,
      meals: parents,
      water: rows('water_intake_entries').filter((row) =>
        entries.some((e) => e.id === row.food_entry_id)
      ),
    });
  });
  vi.mocked(diary.readSnapshots).mockImplementation(
    async (_client, table, _user, ids) =>
      structuredClone(rows(table).filter((row) => ids.includes(String(row.id))))
  );
  vi.mocked(diary.readLinkedWater).mockImplementation(
    async (_client, _user, ids) =>
      structuredClone(
        rows('water_intake_entries').filter((row) =>
          ids.includes(String(row.food_entry_id))
        )
      )
  );
  vi.mocked(diary.insertSnapshot).mockImplementation(
    async (_client, table, _user, row) => {
      db[table].set(String(row.id), structuredClone(row));
    }
  );
  vi.mocked(diary.updateSnapshot).mockImplementation(
    async (_client, table, _user, row) => {
      db[table].set(String(row.id), structuredClone(row));
    }
  );
  vi.mocked(diary.deleteSnapshots).mockImplementation(
    async (_client, table, _user, ids) => {
      ids.forEach((id) => db[table].delete(id));
      if (table === 'food_entries')
        for (const row of rows('water_intake_entries'))
          if (ids.includes(String(row.food_entry_id)))
            db.water_intake_entries.delete(String(row.id));
    }
  );
  vi.mocked(diary.hasOtherMealEntries).mockImplementation(
    async (_client, _user, mealId, ids) =>
      rows('food_entries').some(
        (row) =>
          row.food_entry_meal_id === mealId && !ids.includes(String(row.id))
      )
  );
});

describe('verified diary changes', () => {
  it('logs an entire saved recipe with its confirmed yield and retained unknown nutrients', async () => {
    const recipeId = randomUUID();
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      id: recipeId,
      user_id: userId,
      name: 'Bread recipe',
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 2,
      updated_at: now,
      images: ['/uploads/recipe.jpg'],
      foods: [
        {
          id: randomUUID(),
          food_id: foodId,
          variant_id: variantId,
          food_name: 'White bread',
          quantity: 4,
          unit: 'slice',
          serving_size: 1,
          serving_unit: 'slice',
          calories: 80,
          protein: 3,
          carbs: 15,
          fat: 1,
          sodium: null,
        },
      ],
    });
    vi.mocked(meals.createFoodEntryMealWithClient).mockImplementation(
      async (_client, data) => {
        const parent = { ...data, id: randomUUID(), user_id: userId };
        db.food_entry_meals.set(
          parent.id,
          z
            .record(z.string(), z.json())
            .parse(JSON.parse(JSON.stringify(parent)))
        );
        return parent;
      }
    );
    await apply({
      type: 'log_recipe',
      meal_id: recipeId,
      expected_recipe_updated_at: now,
      quantity: 1,
      unit: 'serving',
      destination,
    });
    const added = rows('food_entries').filter((row) => row.id !== oldId);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ quantity: 2, calories: 80, sodium: null });
    expect(task.result).toMatchObject({
      nutrition: { calories: 160, sodium: null },
    });
    expect(
      db.food_entry_meals.get(String(added[0]!.food_entry_meal_id))
    ).toMatchObject({
      quantity: 1,
      entry_total_servings: 2,
      images: ['/uploads/recipe.jpg'],
    });
  });
  it('does not log a partial saved recipe when a component is missing', async () => {
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      id: foodId,
      user_id: userId,
      name: 'Incomplete recipe',
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 1,
      updated_at: now,
      foods: [
        {
          id: randomUUID(),
          food_id: foodId,
          variant_id: variantId,
          food_name: 'Bread',
          quantity: 4,
          unit: 'slice',
          serving_size: 1,
          serving_unit: 'slice',
          calories: null,
          protein: 3,
          carbs: 15,
          fat: 1,
        },
      ],
    });
    await expect(
      apply({
        type: 'log_recipe',
        meal_id: foodId,
        expected_recipe_updated_at: now,
        quantity: 1,
        unit: 'serving',
        destination,
      })
    ).rejects.toThrow('Core nutrition');
    expect(rows('food_entries')).toHaveLength(1);
    expect(task.status).toBe('draft');
    expect(meals.createFoodEntryMealWithClient).not.toHaveBeenCalled();
  });
  it('refuses to overwrite a recreated water identity during deletion undo', async () => {
    const waterId = randomUUID();
    db.water_intake_entries.set(waterId, {
      id: waterId,
      user_id: userId,
      food_entry_id: oldId,
      water_ml: 100,
      entry_date: '2026-10-08',
      source: 'container',
    });
    const result = await apply({
      type: 'delete',
      scope,
      expected_fingerprint: await observed(),
    });
    db.water_intake_entries.set(waterId, {
      id: waterId,
      user_id: userId,
      food_entry_id: null,
      water_ml: 200,
      entry_date: '2026-10-09',
      source: 'manual',
    });
    await expect(
      service.undoDiary(
        userId,
        taskId,
        {
          operation_id: randomUUID(),
          expected_version: task.version,
          diary_operation_id: result.id,
          source_quote: 'Undo deletion',
        },
        'Undo deletion'
      )
    ).rejects.toThrow('recreated');
    expect(db.water_intake_entries.get(waterId)?.water_ml).toBe(200);
    expect(rows('food_entries')).toHaveLength(0);
  });
  it('logs several verified foods in one meal and accepts database-normalized numeric fields and time', async () => {
    vi.mocked(meals.createFoodEntryMealWithClient).mockImplementation(
      async (_client, data) => {
        const parent = {
          id: randomUUID(),
          user_id: userId,
          name: data.name,
          quantity: 1,
          unit: 'serving',
          meal_type_id: mealType,
          entry_date: '2026-10-09',
          entry_time: '12:30:00',
          images: [],
        };
        db.food_entry_meals.set(parent.id, parent);
        return { ...parent, quantity: '1' };
      }
    );
    vi.mocked(diary.insertSnapshot).mockImplementation(
      async (_client, table, _user, row) => {
        db[table].set(String(row.id), {
          ...row,
          entry_time: row.entry_time === '12:30' ? '12:30:00' : row.entry_time,
        });
      }
    );
    await apply({
      type: 'log',
      foods: [
        { food_id: foodId, quantity: 2, unit: 'slice' },
        { food_id: foodId, quantity: 1, unit: 'slice' },
      ],
      destination: { ...destination, time: '12:30' },
      meal_name: 'Bread lunch',
    });
    const newEntries = rows('food_entries').filter((row) => row.id !== oldId);
    expect(newEntries).toHaveLength(2);
    expect(newEntries[0].food_entry_meal_id).toBe(
      newEntries[1].food_entry_meal_id
    );
    expect(task.result).toMatchObject({ nutrition: { calories: 240 } });
  });
  it('replaces sourdough in place with two real slices and reads back 160 calories', async () => {
    const result = await apply({
      type: 'replace',
      scope,
      expected_fingerprint: await observed(),
      food: { food_id: foodId, quantity: 2, unit: 'slices' },
    });
    expect(rows('food_entries')).toEqual([
      expect.objectContaining({
        id: oldId,
        food_id: foodId,
        variant_id: variantId,
        quantity: 2,
        unit: 'slice',
        food_name: 'White bread',
        serving_size: 1,
        calories: 80,
        notes: 'Toasted',
        food_entry_meal_id: parentId,
      }),
    ]);
    expect(
      foodAssistantTaskSchema.parse(result.after_state).result
    ).toMatchObject({
      kind: 'diary',
      nutrition: { calories: 160 },
      after: { entries: [expect.objectContaining({ food_id: foodId })] },
    });
    expect(foodRepository.getFoodById).toHaveBeenCalledWith(
      foodId,
      userId,
      client,
      true
    );
  });
  it('rejects a five-calorie bread reference instead of saving a fabricated correction', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...bread,
      variants: [
        {
          ...bread.variants[0],
          calories: 2.5,
          protein: 0.1,
          carbs: 0.2,
          fat: 0.1,
        },
      ],
    });
    await expect(
      apply({
        type: 'replace',
        scope,
        expected_fingerprint: await observed(),
        food: { food_id: foodId, quantity: 2, unit: 'slice' },
      })
    ).rejects.toThrow('implausible');
    expect(rows('food_entries')[0].food_name).toBe('Sourdough');
    expect(diary.updateSnapshot).not.toHaveBeenCalled();
  });
  it('rejects a different food variant and does not mutate the entry', async () => {
    await expect(
      apply({
        type: 'replace',
        scope,
        expected_fingerprint: await observed(),
        food: {
          food_id: foodId,
          variant_id: randomUUID(),
          quantity: 2,
          unit: 'slice',
        },
      })
    ).rejects.toThrow('does not belong');
    expect(diary.updateSnapshot).not.toHaveBeenCalled();
  });
  it('detects newer notes and nutrition edits in the inspected fingerprint', async () => {
    const fingerprint = await observed();
    db.food_entries.set(oldId, entry({ notes: 'Changed later' }));
    await expect(
      apply({ type: 'delete', scope, expected_fingerprint: fingerprint })
    ).rejects.toThrow('selection changed');
    expect(diary.deleteSnapshots).not.toHaveBeenCalled();
  });
  it('resizes the historical snapshot without loading the current catalog', async () => {
    await apply({
      type: 'resize',
      scope,
      expected_fingerprint: await observed(),
      portion: { quantity: 120, unit: 'g' },
    });
    expect(rows('food_entries')[0]).toMatchObject({
      quantity: 120,
      calories: 250,
      custom_nutrients: { test: 4 },
      notes: 'Toasted',
    });
    expect(foodRepository.getFoodById).not.toHaveBeenCalled();
  });
  it('refuses to interpret slices as grams when the logged reference has no count equivalence', async () => {
    await expect(
      apply({
        type: 'resize',
        scope,
        expected_fingerprint: await observed(),
        portion: { quantity: 2, unit: 'slice' },
      })
    ).rejects.toThrow();
    expect(diary.updateSnapshot).not.toHaveBeenCalled();
  });
  it('scales a whole logged meal and its linked drink together', async () => {
    const waterId = randomUUID();
    db.water_intake_entries.set(waterId, {
      id: waterId,
      user_id: userId,
      food_entry_id: oldId,
      entry_date: '2026-10-08',
      source: 'manual',
      water_ml: 300,
      hydration_factor: 1,
    });
    const mealScope = { type: 'logged_meal' as const, id: parentId };
    const preview = await service.inspectDiary(userId, mealScope);
    await apply({
      type: 'scale',
      scope: mealScope,
      expected_fingerprint: preview.fingerprint,
      factor: 2,
    });
    expect(rows('food_entries')[0].quantity).toBe(120);
    expect(rows('food_entry_meals')[0].quantity).toBe(2);
    expect(rows('water_intake_entries')[0].water_ml).toBe(600);
    expect(measurementRepository.recomputeWaterAggregate).toHaveBeenCalledWith(
      client,
      userId,
      userId,
      '2026-10-08',
      'manual'
    );
  });
  it('copies every snapshot to new identities and undo removes only the copies', async () => {
    const original = structuredClone(rows('food_entries'));
    const result = await apply({
      type: 'copy',
      scope,
      expected_fingerprint: await observed(),
      destination,
    });
    const copies = rows('food_entries').filter((row) => row.id !== oldId);
    expect(copies).toEqual([
      expect.objectContaining({
        quantity: 60,
        calories: 250,
        entry_date: '2026-10-09',
        notes: 'Toasted',
        images: ['/uploads/toast.jpg'],
        source: null,
      }),
    ]);
    const operation = result.id;
    await service.undoDiary(
      userId,
      taskId,
      {
        operation_id: randomUUID(),
        expected_version: task.version,
        diary_operation_id: operation,
        source_quote: 'Undo that copy',
      },
      'Undo that copy'
    );
    expect(rows('food_entries')).toEqual(original);
    expect(rows('food_entry_meals')).toHaveLength(1);
  });
  it('moves a single component out of its meal while preserving the rest of the group', async () => {
    const another = entry({ id: randomUUID(), food_name: 'Soup' });
    db.food_entries.set(String(another.id), another);
    await apply({
      type: 'move',
      scope,
      expected_fingerprint: await observed(),
      destination,
    });
    expect(db.food_entries.get(oldId)).toMatchObject({
      entry_date: '2026-10-09',
      food_entry_meal_id: null,
      calories: 250,
    });
    expect(db.food_entries.get(String(another.id))).toEqual(another);
    expect(rows('food_entry_meals')[0].entry_date).toBe('2026-10-08');
  });
  it('requires a preview confirmation for whole-meal deletion and restores its components on undo', async () => {
    const mealScope = { type: 'logged_meal' as const, id: parentId },
      preview = await service.inspectDiary(userId, mealScope);
    await expect(
      apply(
        {
          type: 'delete',
          scope: mealScope,
          expected_fingerprint: preview.fingerprint,
        },
        'Delete lunch'
      )
    ).rejects.toThrow('confirmation');
    const result = await apply(
      {
        type: 'delete',
        scope: mealScope,
        expected_fingerprint: preview.fingerprint,
        confirmation_quote: 'Confirm delete lunch',
      },
      'Confirm delete lunch'
    );
    expect(rows('food_entries')).toHaveLength(0);
    expect(rows('food_entry_meals')).toHaveLength(0);
    await service.undoDiary(
      userId,
      taskId,
      {
        operation_id: randomUUID(),
        expected_version: task.version,
        diary_operation_id: result.id,
        source_quote: 'Undo deletion',
      },
      'Undo deletion'
    );
    expect(rows('food_entries')[0]).toMatchObject({
      id: oldId,
      notes: 'Toasted',
      food_entry_meal_id: parentId,
    });
  });
  it('refuses undo after a later quantity or metadata change', async () => {
    const result = await apply({
      type: 'resize',
      scope,
      expected_fingerprint: await observed(),
      portion: { quantity: 120, unit: 'g' },
    });
    const changed = db.food_entries.get(oldId)!;
    changed.notes = 'Newer work';
    db.food_entries.set(oldId, changed);
    await expect(
      service.undoDiary(
        userId,
        taskId,
        {
          operation_id: randomUUID(),
          expected_version: task.version,
          diary_operation_id: result.id,
          source_quote: 'Undo resizing',
        },
        'Undo resizing'
      )
    ).rejects.toThrow('overwrite newer');
    expect(db.food_entries.get(oldId)?.notes).toBe('Newer work');
  });
  it('rolls back the task when persisted food identity disagrees with the requested replacement', async () => {
    vi.mocked(diary.updateSnapshot).mockImplementation(
      async (_client, table, _user, row) => {
        db[table].set(String(row.id), { ...row, food_id: randomUUID() });
      }
    );
    await expect(
      apply({
        type: 'replace',
        scope,
        expected_fingerprint: await observed(),
        food: { food_id: foodId, quantity: 2, unit: 'slice' },
      })
    ).rejects.toThrow('did not match');
    expect(task.status).toBe('draft');
    expect(rows('food_entries')[0].food_name).toBe('Sourdough');
  });
});
