import { randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import {
  getConversionFactor,
  buildFoodAssistantShoppingSchema,
  changeFoodAssistantShoppingSchema,
  undoFoodAssistantShoppingSchema,
  foodAssistantShoppingResultSchema,
  foodAssistantTaskSchema,
} from '@workspace/shared';
import * as tasks from '../models/foodAssistantRepository.js';
import * as plans from '../models/foodAssistantPlanRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import type { DiarySnapshot } from '../models/foodAssistantDiaryRepository.js';
import { resolvePlan } from './foodAssistantPlanService.js';
import { getRecipe } from './foodAssistantRecipeService.js';
import { normalizePortionUnit } from '../utils/foodPortionResolver.js';
import { canonicalJson } from '../utils/canonicalJson.js';

/** Household sizes remain distinct; only compatible mass/volume units convert. */
export function aggregateShoppingItems(
  rows: DiarySnapshot[],
  pantry: { food_id: string; quantity: number; unit: string }[],
  taskId: string
) {
  const items = new Map<
    string,
    z.infer<typeof foodAssistantShoppingResultSchema>['items'][number]
  >();
  for (const row of rows) {
    const name = z.string().min(1).parse(row.food_name);
    const foodId = z
      .string()
      .uuid()
      .nullable()
      .parse(row.food_id ?? null);
    const unit = normalizePortionUnit(row.unit),
      quantity = z.coerce.number().positive().finite().parse(row.quantity);
    if (!unit)
      throw new FoodAssistantConflict(
        `The shopping quantity for ${name} needs a unit.`
      );
    const identity = foodId ?? name.trim().toLowerCase();
    const compatible = [...items.entries()].find(
      ([key, item]) =>
        key.startsWith(`${identity}:`) &&
        (item.unit === unit || getConversionFactor(item.unit, unit) !== null)
    );
    const key = compatible?.[0] ?? `${identity}:${unit}`,
      item = compatible?.[1];
    if (item) {
      item.quantity += quantity * (getConversionFactor(item.unit, unit) ?? 1);
      item.required_quantity = item.quantity;
    } else
      items.set(key, {
        id: uuidv5(key, taskId),
        food_id: foodId,
        name,
        quantity,
        required_quantity: quantity,
        unit,
        pantry_quantity: 0,
        purchased: false,
      });
  }
  for (const stock of pantry) {
    let remaining = stock.quantity;
    const unit = normalizePortionUnit(stock.unit);
    for (const item of items.values()) {
      if (item.food_id !== stock.food_id) continue;
      const factor =
        item.unit === unit ? 1 : getConversionFactor(item.unit, unit);
      if (factor === null) continue;
      const used = Math.min(item.quantity, remaining * factor);
      item.quantity -= used;
      item.pantry_quantity += used;
      remaining -= used / factor;
      if (remaining <= 0) break;
    }
  }
  return [...items.values()];
}

export async function buildShopping(
  userId: string,
  taskId: string,
  raw: unknown
) {
  const input = buildFoodAssistantShoppingSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'build_shopping_list',
      request: input,
    },
    async (task, client) => {
      if (task.kind !== 'shopping')
        throw new FoodAssistantConflict(
          'Use a shopping task for a shopping list.'
        );
      let sources: { date: string; foods: DiarySnapshot[] }[] = [];
      if (input.plan_task_id) {
        const source = await tasks.getTask(userId, input.plan_task_id, client);
        const result = z
          .object({
            kind: z.literal('meal_plan'),
            shopping_sources: z.array(
              z.object({
                date: z.string(),
                foods: z.array(z.record(z.string(), z.json())),
              })
            ),
          })
          .safeParse(source?.result);
        if (!source || source.status !== 'complete' || !result.success)
          throw new FoodAssistantConflict(
            'Read a completed plan publication before building its shopping list.'
          );
        sources = result.data.shopping_sources;
      } else if (input.plan_id) {
        const source = await plans.readPlan(
          userId,
          input.plan_id,
          client,
          true
        );
        if (!source)
          throw new FoodAssistantConflict(
            'Plan not found or not owned by you.'
          );
        const ingredients = [],
          assignments = [];
        for (const row of source.assignments) {
          const id = z.string().uuid().parse(row.id),
            type = row.item_type;
          if (type === 'food') {
            ingredients.push({
              id,
              description: 'Saved plan food',
              status: 'selected',
              food_id: row.food_id,
              variant_id: row.variant_id ?? undefined,
              quantity: Number(row.quantity),
              unit: row.unit,
            });
            assignments.push({
              id,
              item_type: 'food',
              ingredient_id: id,
              day_of_week: row.day_of_week,
              meal_type_id: row.meal_type_id,
            });
          } else if (type === 'meal') {
            const meal = await getRecipe(
              userId,
              z.string().uuid().parse(row.meal_id),
              client
            );
            assignments.push({
              id,
              item_type: 'meal',
              meal_id: row.meal_id,
              quantity: Number(row.quantity),
              unit: row.unit,
              day_of_week: row.day_of_week,
              meal_type_id: row.meal_type_id,
              expected_recipe_updated_at: meal.updated_at.toISOString(),
            });
          } else
            throw new FoodAssistantConflict(
              'The plan contains an unsupported item.'
            );
        }
        const draft = foodAssistantTaskSchema.parse({
          ...task,
          kind: 'meal_plan',
          checkpoint: {
            summary: 'Shopping source',
            ingredients,
            plan: {
              name: source.plan.plan_name,
              start_date: input.start_date ?? source.plan.start_date,
              end_date: input.end_date ?? source.plan.end_date,
              assignments,
            },
          },
        });
        const resolved = await resolvePlan(userId, draft, client);
        if (resolved.issues.length)
          throw new FoodAssistantConflict(
            `The source plan remains incomplete: ${resolved.issues.map((row) => row.message).join(' ')}`
          );
        sources = resolved.schedule.map((row) => ({
          date: row.date,
          foods: row.leaves,
        }));
      }
      const foods = sources
        .filter(
          (row) =>
            (!input.start_date || row.date >= input.start_date) &&
            (!input.end_date || row.date <= input.end_date)
        )
        .flatMap((row) => row.foods);
      foods.push(
        ...input.items.map((item) => ({
          food_name: item.name,
          food_id: item.food_id ?? null,
          quantity: item.quantity,
          unit: item.unit,
        }))
      );
      if (!foods.length)
        throw new FoodAssistantConflict(
          'No shopping items exist in that date range. Nothing was saved.'
        );
      const result = foodAssistantShoppingResultSchema.parse({
        kind: 'shopping',
        publication_operation_id: input.operation_id,
        plan_id: input.plan_id ?? null,
        plan_task_id: input.plan_task_id ?? null,
        items: aggregateShoppingItems(foods, input.pantry, task.id),
      });
      return { ...task, status: 'complete', result: z.json().parse(result) };
    }
  );
}

export async function changeShopping(
  userId: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = changeFoodAssistantShoppingSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'change_shopping_list',
      request: input,
      allowComplete: true,
    },
    async (task) => {
      const result = foodAssistantShoppingResultSchema.parse(task.result);
      if (task.kind !== 'shopping' || task.status !== 'complete')
        throw new FoodAssistantConflict(
          'Read the current completed shopping list before editing it.'
        );
      const change = input.change;
      if (change.type === 'add') {
        if (result.items.length >= 500)
          throw new FoodAssistantConflict('The shopping list is full.');
        result.items.push({
          id: randomUUID(),
          food_id: change.food_id ?? null,
          name: change.name,
          quantity: change.quantity,
          required_quantity: change.quantity,
          pantry_quantity: 0,
          unit: change.unit,
          purchased: false,
        });
      } else {
        const item = result.items.find((row) => row.id === change.item_id);
        if (!item)
          throw new FoodAssistantConflict(
            'Shopping item not found. Refresh the list.'
          );
        if (change.type === 'mark') item.purchased = change.purchased;
        else {
          if (
            !currentText?.includes(change.source_quote) ||
            !/\b(remove|delete|drop)\b/i.test(change.source_quote)
          )
            throw new FoodAssistantConflict(
              'Removing a shopping item needs an explicit current user request.'
            );
          result.items = result.items.filter(
            (row) => row.id !== change.item_id
          );
        }
      }
      return { ...task, result: z.json().parse(result) };
    }
  );
}

export async function undoShopping(
  userId: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = undoFoodAssistantShoppingSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'undo_shopping_list',
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
      const operation = await tasks.getOperation(
        userId,
        taskId,
        input.shopping_operation_id,
        client
      );
      if (
        !operation ||
        !['build_shopping_list', 'change_shopping_list'].includes(
          operation.kind
        )
      )
        throw new FoodAssistantConflict('Shopping operation not found.');
      const after = foodAssistantTaskSchema.parse(operation.after_state),
        before = foodAssistantTaskSchema.parse(operation.before_state);
      if (
        task.kind !== 'shopping' ||
        task.version !== after.version ||
        canonicalJson(task.result) !== canonicalJson(after.result)
      )
        throw new FoodAssistantConflict(
          'The shopping list changed. Undo would overwrite newer work.'
        );
      return {
        ...task,
        result: before.result,
        status: before.status,
        checkpoint: before.checkpoint,
      };
    }
  );
}
