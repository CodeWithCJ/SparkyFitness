import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  applyFoodAssistantDiarySchema,
  undoFoodAssistantDiarySchema,
  foodAssistantDiaryScopeSchema,
  foodVolumeToMl,
} from '@workspace/shared';
import * as diary from '../models/foodAssistantDiaryRepository.js';
import type {
  DiarySelection,
  DiarySnapshot,
} from '../models/foodAssistantDiaryRepository.js';
import * as tasks from '../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import foodRepository from '../models/foodRepository.js';
import * as mealEntryRepository from '../models/foodEntryMealRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import {
  resolveFoodSelection,
  nutrientFields,
  assertFoodEstimateAccepted,
} from '../utils/foodNutritionSnapshot.js';
import { expandSavedMeal } from '../utils/savedMealExpansion.js';
import {
  nutrientNumber,
  resolveFoodPortion,
} from '../utils/foodPortionResolver.js';
import { canonicalJson } from '../utils/canonicalJson.js';

const snapshotSchema = z.record(z.string(), z.json());
const selectionSchema = z.object({
  entries: z.array(snapshotSchema),
  meals: z.array(snapshotSchema),
  water: z.array(snapshotSchema),
});
const empty = (): DiarySelection => ({ entries: [], meals: [], water: [] });
export function diaryFingerprint(selection: DiarySelection) {
  const sorted = Object.fromEntries(
    Object.entries(selection).map(([key, rows]) => [
      key,
      [...rows].sort((a, b) =>
        diary.snapshotId(a).localeCompare(diary.snapshotId(b))
      ),
    ])
  );
  return createHash('sha256').update(canonicalJson(sorted)).digest('hex');
}
function jsonSnapshot(value: unknown): DiarySnapshot {
  return snapshotSchema.parse(JSON.parse(JSON.stringify(value)));
}
function stringField(row: DiarySnapshot, field: string) {
  return z.string().parse(row[field]);
}
export function assertDiaryReadback(
  expected: DiarySnapshot[],
  actual: DiarySnapshot[]
) {
  if (expected.length !== actual.length)
    throw new FoodAssistantConflict(
      'Diary readback count did not match. Nothing was committed.'
    );
  for (const row of expected) {
    const stored = actual.find((other) => other.id === row.id);
    if (
      !stored ||
      Object.entries(row).some(([field, value]) => {
        if (field === 'updated_at') return false; // Database triggers choose this timestamp.
        if (
          field === 'entry_time' &&
          typeof value === 'string' &&
          typeof stored[field] === 'string'
        ) {
          const normalize = (time: string) =>
            /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
          return normalize(value) !== normalize(stored[field]);
        }
        if (
          ['created_at', 'logged_at'].includes(field) &&
          typeof value === 'string' &&
          typeof stored[field] === 'string'
        )
          return (
            new Date(value).getTime() !== new Date(stored[field]).getTime()
          );
        return (
          canonicalJson(stored[field] ?? null) !== canonicalJson(value ?? null)
        );
      })
    )
      throw new FoodAssistantConflict(
        'Persisted diary identity, portion or nutrition did not match. Nothing was committed.'
      );
  }
}
export async function readDiaryManifest(
  client: PoolClient,
  userId: string,
  manifest: DiarySelection,
  lock = false
): Promise<DiarySelection> {
  return {
    meals: await diary.readSnapshots(
      client,
      'food_entry_meals',
      userId,
      manifest.meals.map(diary.snapshotId),
      lock
    ),
    entries: await diary.readSnapshots(
      client,
      'food_entries',
      userId,
      manifest.entries.map(diary.snapshotId),
      lock
    ),
    water: await diary.readLinkedWater(
      client,
      userId,
      manifest.entries.map(diary.snapshotId),
      lock
    ),
  };
}
export async function recomputeDiaryWater(
  client: PoolClient,
  userId: string,
  ...selections: DiarySelection[]
) {
  const keys = new Map<string, { date: string; source: string }>();
  for (const selection of selections)
    for (const row of selection.water) {
      const date = stringField(row, 'entry_date'),
        source = stringField(row, 'source');
      keys.set(`${date}:${source}`, { date, source });
    }
  for (const { date, source } of keys.values())
    await measurementRepository.recomputeWaterAggregate(
      client,
      userId,
      userId,
      date,
      source
    );
}
export async function assertAbsentDiaryIdentities(
  client: PoolClient,
  userId: string,
  before: DiarySelection,
  after: DiarySelection
) {
  for (const [table, key] of [
    ['food_entry_meals', 'meals'],
    ['food_entries', 'entries'],
    ['water_intake_entries', 'water'],
  ] as const) {
    const ids = before[key]
      .filter((row) => !after[key].some((other) => other.id === row.id))
      .map(diary.snapshotId);
    if ((await diary.readSnapshots(client, table, userId, ids, true)).length)
      throw new FoodAssistantConflict(
        'A deleted diary item was recreated. Inspect it before undoing.'
      );
  }
}
async function selectFood(
  userId: string,
  client: PoolClient,
  selection: {
    food_id: string;
    variant_id?: string;
    quantity: number;
    unit: string;
  },
  quote?: string,
  currentText?: string
) {
  const food = await foodRepository.getFoodById(
    selection.food_id,
    userId,
    client,
    true
  );
  if (!food)
    throw new FoodAssistantConflict('Selected food is no longer accessible.');
  const result = resolveFoodSelection(food, selection);
  if (!result.ok) throw new FoodAssistantConflict(result.message);
  assertFoodEstimateAccepted(result.estimated, quote, currentText);
  return result.snapshot;
}
export async function inspectDiary(userId: string, rawScope: unknown) {
  const scope = foodAssistantDiaryScopeSchema.parse(rawScope);
  const selection = await diary.readSelection(userId, scope);
  return {
    scope,
    fingerprint: diaryFingerprint(selection),
    ...selection,
    confirmation_required_for_delete:
      scope.type !== 'entries' || selection.entries.length > 1,
    nutrition: diaryNutritionTotals(selection.entries),
  };
}
export function diaryNutritionTotals(entries: DiarySnapshot[]) {
  return Object.fromEntries(
    nutrientFields.map((field) => {
      let total = 0;
      for (const row of entries) {
        const n = nutrientNumber(row[field]),
          q = nutrientNumber(row.quantity),
          s = nutrientNumber(row.serving_size);
        if (n === null || q === null || s === null || s <= 0)
          return [field, null];
        total += (n * q) / s;
      }
      return [field, total];
    })
  );
}

export async function applyDiary(
  userId: string,
  taskId: string,
  rawInput: unknown,
  currentText?: string
) {
  const input = applyFoodAssistantDiarySchema.parse(rawInput);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'apply_diary',
      request: input,
    },
    async (task, client) => {
      if (task.kind !== 'diary')
        throw new FoodAssistantConflict('Use a diary task for diary changes.');
      const action = input.action;
      const before =
        action.type === 'log' || action.type === 'log_recipe'
          ? empty()
          : await diary.readSelection(userId, action.scope, client, true);
      if (
        action.type !== 'log' &&
        action.type !== 'log_recipe' &&
        (diaryFingerprint(before) !== action.expected_fingerprint ||
          (!before.entries.length && !before.meals.length))
      )
        throw new FoodAssistantConflict(
          'The diary selection changed. Inspect it again before applying this action.'
        );
      if (
        action.type === 'delete' &&
        (action.scope.type !== 'entries' || before.entries.length > 1) &&
        (!action.confirmation_quote ||
          !currentText?.includes(action.confirmation_quote) ||
          !/\b(confirm|go ahead|yes.*delete|delete.*shown|delete.*preview)\b/i.test(
            action.confirmation_quote
          ))
      )
        throw new FoodAssistantConflict(
          'Show the selected meal and entries, then obtain confirmation before deleting this bulk selection.'
        );
      const expected: DiarySelection = structuredClone(before);
      if (action.type === 'log' || action.type === 'log_recipe') {
        const saved =
          action.type === 'log_recipe'
            ? await expandSavedMeal(
                userId,
                {
                  meal_id: action.meal_id,
                  quantity: action.quantity,
                  unit: action.unit,
                  expected_updated_at: action.expected_recipe_updated_at,
                },
                client
              )
            : undefined;
        if (saved)
          assertFoodEstimateAccepted(
            saved.estimated.length > 0,
            input.estimate_source_quote,
            currentText
          );
        const snapshots = saved
          ? saved.leaves
          : await Promise.all(
              (action.type === 'log' ? action.foods : []).map((food) =>
                selectFood(
                  userId,
                  client,
                  food,
                  input.estimate_source_quote,
                  currentText
                )
              )
            );
        const logged = await writeVerifiedDiaryLog(userId, client, {
          snapshots,
          destination: action.destination,
          parent: saved
            ? {
                name: saved.meal.name,
                meal_template_id: saved.meal.id,
                description: saved.meal.description,
                images: saved.meal.images,
                quantity: saved.portion.quantity,
                unit: saved.portion.unit,
                entry_total_servings:
                  saved.meal.serving_size * saved.meal.total_servings,
              }
            : action.type === 'log' && action.meal_name
              ? {
                  name: action.meal_name,
                  quantity: 1,
                  unit: 'serving',
                  entry_total_servings: 1,
                }
              : undefined,
        });
        Object.assign(expected, logged);
      } else if (action.type === 'replace' || action.type === 'resize') {
        if (before.entries.length !== 1)
          throw new FoodAssistantConflict(
            'Select exactly one entry for replacement or resizing. Use a whole-meal action to resize a meal.'
          );
        const row = expected.entries[0];
        if (action.type === 'replace') {
          Object.assign(
            row,
            await selectFood(
              userId,
              client,
              action.food,
              input.estimate_source_quote,
              currentText
            ),
            { updated_by_user_id: userId, source: null, source_id: null }
          );
        } else {
          const reference = {
            serving_size: nutrientNumber(row.serving_size),
            serving_unit:
              typeof row.serving_unit === 'string' ? row.serving_unit : null,
          };
          const portion = resolveFoodPortion({
            quantity: action.portion.quantity,
            unit: action.portion.unit,
            variants: [reference],
            explicitVariant: reference,
          });
          if (!portion.ok) throw new FoodAssistantConflict(portion.message);
          Object.assign(row, {
            quantity: portion.quantity,
            unit: portion.unit,
            updated_by_user_id: userId,
          });
        }
        await diary.updateSnapshot(client, 'food_entries', userId, row);
        for (const water of expected.water) {
          const q = Number(row.quantity),
            size = Number(row.serving_size),
            ml = nutrientNumber(row.water_ml);
          const consumed =
            ml !== null && ml > 0
              ? (ml * q) / size
              : foodVolumeToMl(q, stringField(row, 'unit'));
          if (consumed === null)
            throw new FoodAssistantConflict(
              'This entry is linked to a drink. Verify its water quantity before replacing it.'
            );
          water.water_ml =
            consumed * (nutrientNumber(water.hydration_factor) ?? 1);
          await diary.updateSnapshot(
            client,
            'water_intake_entries',
            userId,
            water
          );
        }
      } else if (action.type === 'scale') {
        for (const meal of expected.meals) {
          if (
            await diary.hasOtherMealEntries(
              client,
              userId,
              diary.snapshotId(meal),
              before.entries.map(diary.snapshotId)
            )
          )
            continue;
          const quantity = nutrientNumber(meal.quantity);
          if (quantity === null || quantity <= 0)
            throw new FoodAssistantConflict(
              'The logged meal quantity needs clarification.'
            );
          meal.quantity = quantity * action.factor;
          meal.updated_by_user_id = userId;
          await diary.updateSnapshot(client, 'food_entry_meals', userId, meal);
        }
        for (const row of expected.entries) {
          const quantity = nutrientNumber(row.quantity);
          if (quantity === null || quantity <= 0)
            throw new FoodAssistantConflict(
              'The logged entry quantity needs clarification.'
            );
          row.quantity = quantity * action.factor;
          row.updated_by_user_id = userId;
          await diary.updateSnapshot(client, 'food_entries', userId, row);
        }
        for (const row of expected.water) {
          const water = nutrientNumber(row.water_ml);
          if (water === null || water < 0)
            throw new FoodAssistantConflict(
              'The linked drink quantity needs clarification.'
            );
          row.water_ml = water * action.factor;
          await diary.updateSnapshot(
            client,
            'water_intake_entries',
            userId,
            row
          );
        }
      } else if (action.type === 'delete') {
        await diary.deleteSnapshots(
          client,
          'food_entries',
          userId,
          before.entries.map(diary.snapshotId)
        );
        expected.entries = [];
        expected.water = [];
        expected.meals = [];
        for (const meal of before.meals) {
          if (
            await diary.hasOtherMealEntries(
              client,
              userId,
              diary.snapshotId(meal),
              []
            )
          )
            expected.meals.push(meal);
          else
            await diary.deleteSnapshots(client, 'food_entry_meals', userId, [
              diary.snapshotId(meal),
            ]);
        }
      } else {
        await mealEntryRepository.resolveMealTypeIdWithClient(
          client,
          action.destination.meal_type_id,
          undefined
        );
        const copying = action.type === 'copy';
        const mealIds = new Map<string, string>();
        if (copying) expected.meals = [];
        for (const meal of before.meals) {
          const allSelected = !(await diary.hasOtherMealEntries(
            client,
            userId,
            diary.snapshotId(meal),
            before.entries.map(diary.snapshotId)
          ));
          if (!allSelected && !copying) continue; // Moving a component detaches it below.
          const target = jsonSnapshot({
            ...meal,
            id: copying ? randomUUID() : meal.id,
            entry_date: action.destination.date,
            meal_type_id: action.destination.meal_type_id,
            entry_time:
              action.destination.time !== undefined
                ? action.destination.time
                : meal.entry_time,
            updated_by_user_id: userId,
            ...(copying
              ? {
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  created_by_user_id: userId,
                }
              : {}),
          });
          mealIds.set(diary.snapshotId(meal), diary.snapshotId(target));
          if (copying) {
            await diary.insertSnapshot(
              client,
              'food_entry_meals',
              userId,
              target
            );
            expected.meals.push(target);
          } else {
            await diary.updateSnapshot(
              client,
              'food_entry_meals',
              userId,
              target
            );
            expected.meals[
              expected.meals.findIndex((m) => m.id === target.id)
            ] = target;
          }
        }
        const entryIds = new Map<string, string>();
        expected.entries = [];
        for (const row of before.entries) {
          const target = jsonSnapshot({
            ...row,
            id: copying ? randomUUID() : row.id,
            entry_date: action.destination.date,
            meal_type_id: action.destination.meal_type_id,
            entry_time:
              action.destination.time !== undefined
                ? action.destination.time
                : row.entry_time,
            food_entry_meal_id:
              typeof row.food_entry_meal_id === 'string'
                ? (mealIds.get(row.food_entry_meal_id) ?? null)
                : null,
            updated_by_user_id: userId,
            ...(copying
              ? {
                  created_at: new Date().toISOString(),
                  created_by_user_id: userId,
                  source: null,
                  source_id: null,
                }
              : {}),
          });
          entryIds.set(diary.snapshotId(row), diary.snapshotId(target));
          if (copying)
            await diary.insertSnapshot(client, 'food_entries', userId, target);
          else
            await diary.updateSnapshot(client, 'food_entries', userId, target);
          expected.entries.push(target);
        }
        expected.water = [];
        for (const row of before.water) {
          const target = jsonSnapshot({
            ...row,
            id: copying ? randomUUID() : row.id,
            entry_date: action.destination.date,
            food_entry_id: entryIds.get(stringField(row, 'food_entry_id')),
            ...(copying
              ? {
                  created_at: new Date().toISOString(),
                  logged_at: new Date().toISOString(),
                  created_by_user_id: userId,
                  source: 'manual',
                  source_id: null,
                }
              : {}),
          });
          if (copying)
            await diary.insertSnapshot(
              client,
              'water_intake_entries',
              userId,
              target
            );
          else
            await diary.updateSnapshot(
              client,
              'water_intake_entries',
              userId,
              target
            );
          expected.water.push(target);
        }
      }
      const after = await readDiaryManifest(client, userId, expected);
      assertDiaryReadback(expected.entries, after.entries);
      assertDiaryReadback(expected.meals, after.meals);
      assertDiaryReadback(expected.water, after.water);
      if (action.type === 'delete') {
        const remaining = await diary.readSnapshots(
          client,
          'food_entries',
          userId,
          before.entries.map(diary.snapshotId)
        );
        if (remaining.length)
          throw new FoodAssistantConflict(
            'Deleted entries remain in the diary. Nothing was committed.'
          );
      }
      await recomputeDiaryWater(client, userId, before, after);
      return {
        ...task,
        status: 'complete',
        result: z.json().parse({
          kind: 'diary',
          diary_operation_id: input.operation_id,
          action: action.type,
          before: action.type === 'copy' ? empty() : before,
          source_snapshot: action.type === 'copy' ? before : null,
          after,
          nutrition: diaryNutritionTotals(after.entries),
          estimate_acceptance_quote: input.estimate_source_quote ?? null,
        }),
      };
    }
  );
}

/** Domain callers resolve nutrition before this write. A plan and a normal
 * diary log use identical grouping, metadata and persisted readback rules. */
export async function writeVerifiedDiaryLog(
  userId: string,
  client: PoolClient,
  input: {
    snapshots: DiarySnapshot[];
    destination: { date: string; meal_type_id: string; time?: string | null };
    template_id?: string;
    parent?: {
      name: string;
      meal_template_id?: string;
      description?: string | null;
      images?: string[];
      quantity: number;
      unit: string;
      entry_total_servings: number;
    };
  }
): Promise<DiarySelection> {
  if (!input.snapshots.length)
    throw new FoodAssistantConflict(
      'A meal needs at least one resolved ingredient.'
    );
  await mealEntryRepository.resolveMealTypeIdWithClient(
    client,
    input.destination.meal_type_id,
    undefined
  );
  const expected = empty();
  let parentId: string | null = null;
  if (input.parent) {
    const parent = await mealEntryRepository.createFoodEntryMealWithClient(
      client,
      {
        ...input.parent,
        user_id: userId,
        entry_date: input.destination.date,
        entry_time: input.destination.time ?? null,
        meal_type_id: input.destination.meal_type_id,
      },
      userId
    );
    parentId = z.string().uuid().parse(parent.id);
    const stored = (
      await diary.readSnapshots(client, 'food_entry_meals', userId, [parentId])
    )[0];
    if (!stored)
      throw new FoodAssistantConflict('Logged meal parent readback failed.');
    expected.meals.push(stored);
  }
  const now = new Date().toISOString();
  for (const snapshot of input.snapshots) {
    const row = jsonSnapshot({
      ...snapshot,
      id: randomUUID(),
      user_id: userId,
      meal_id: null,
      meal_plan_template_id: input.template_id ?? null,
      food_entry_meal_id: parentId,
      meal_type_id: input.destination.meal_type_id,
      entry_date: input.destination.date,
      entry_time: input.destination.time ?? null,
      created_at: now,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      source: null,
      source_id: null,
      notes: null,
    });
    await diary.insertSnapshot(client, 'food_entries', userId, row);
    expected.entries.push(row);
  }
  const after = await readDiaryManifest(client, userId, expected);
  assertDiaryReadback(expected.entries, after.entries);
  assertDiaryReadback(expected.meals, after.meals);
  return after;
}

export async function undoDiary(
  userId: string,
  taskId: string,
  rawInput: unknown,
  currentText?: string
) {
  const input = undoFoodAssistantDiarySchema.parse(rawInput);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'undo_diary',
      request: input,
      allowComplete: true,
    },
    async (task, client) => {
      if (
        !currentText?.includes(input.source_quote) ||
        !/\b(undo|revert|restore)\b/i.test(input.source_quote)
      )
        throw new FoodAssistantConflict(
          'Undo needs an explicit current user request.'
        );
      const result = z
        .object({
          kind: z.literal('diary'),
          diary_operation_id: z.string().uuid(),
          action: z.string(),
          before: selectionSchema,
          after: selectionSchema,
        })
        .safeParse(task.result);
      if (
        task.kind !== 'diary' ||
        task.status !== 'complete' ||
        !result.success ||
        result.data.diary_operation_id !== input.diary_operation_id
      )
        throw new FoodAssistantConflict(
          'That operation is not the current completed diary task.'
        );
      const { before, after } = result.data;
      const current = await readDiaryManifest(client, userId, after, true);
      if (diaryFingerprint(current) !== diaryFingerprint(after))
        throw new FoodAssistantConflict(
          'The diary changed after this operation. Undo would overwrite newer work.'
        );
      await assertAbsentDiaryIdentities(client, userId, before, after);
      const addedEntries = after.entries.filter(
        (row) => !before.entries.some((other) => other.id === row.id)
      );
      for (const meal of after.meals.filter(
        (row) => !before.meals.some((other) => other.id === row.id)
      )) {
        if (
          await diary.hasOtherMealEntries(
            client,
            userId,
            diary.snapshotId(meal),
            addedEntries.map(diary.snapshotId)
          )
        )
          throw new FoodAssistantConflict(
            'The copied meal now contains newer entries. Undo cannot remove it.'
          );
      }
      await diary.deleteSnapshots(
        client,
        'water_intake_entries',
        userId,
        after.water
          .filter((row) => !before.water.some((other) => other.id === row.id))
          .map(diary.snapshotId)
      );
      await diary.deleteSnapshots(
        client,
        'food_entries',
        userId,
        addedEntries.map(diary.snapshotId)
      );
      await diary.deleteSnapshots(
        client,
        'food_entry_meals',
        userId,
        after.meals
          .filter((row) => !before.meals.some((other) => other.id === row.id))
          .map(diary.snapshotId)
      );
      for (const [table, key] of [
        ['food_entry_meals', 'meals'],
        ['food_entries', 'entries'],
        ['water_intake_entries', 'water'],
      ] as const) {
        for (const row of before[key]) {
          if (after[key].some((other) => other.id === row.id))
            await diary.updateSnapshot(client, table, userId, row);
          else await diary.insertSnapshot(client, table, userId, row);
        }
      }
      const restored = await readDiaryManifest(client, userId, before);
      assertDiaryReadback(before.entries, restored.entries);
      assertDiaryReadback(before.meals, restored.meals);
      assertDiaryReadback(before.water, restored.water);
      await recomputeDiaryWater(client, userId, before, after);
      return {
        ...task,
        result: z.json().parse({
          kind: 'diary_undo',
          diary_operation_id: input.diary_operation_id,
          before: current,
          after: restored,
        }),
      };
    }
  );
}
