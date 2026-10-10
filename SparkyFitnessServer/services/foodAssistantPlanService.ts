import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  addDays,
  dayOfWeek,
  todayInZone,
  publishFoodAssistantPlanSchema,
  undoFoodAssistantPlanSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import * as tasks from '../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import * as plans from '../models/foodAssistantPlanRepository.js';
import type { PlanSnapshot } from '../models/foodAssistantPlanRepository.js';
import * as diary from '../models/foodAssistantDiaryRepository.js';
import type {
  DiarySelection,
  DiarySnapshot,
} from '../models/foodAssistantDiaryRepository.js';
import foodRepository from '../models/foodRepository.js';
import goalService from './goalService.js';
import {
  resolveFoodSelection,
  assertFoodEstimateAccepted,
} from '../utils/foodNutritionSnapshot.js';
import { expandSavedMeal } from '../utils/savedMealExpansion.js';
import { canonicalJson } from '../utils/canonicalJson.js';
import {
  assertDiaryReadback,
  assertAbsentDiaryIdentities,
  diaryFingerprint,
  diaryNutritionTotals,
  recomputeDiaryWater,
  writeVerifiedDiaryLog,
} from './foodAssistantDiaryService.js';

const snapshot = z.record(z.string(), z.json());
const selectionSchema = z.object({
  entries: z.array(snapshot),
  meals: z.array(snapshot),
  water: z.array(snapshot),
});
const empty = (): DiarySelection => ({ entries: [], meals: [], water: [] });
const asJson = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
export function planFingerprint(plan: PlanSnapshot, selection: DiarySelection) {
  return createHash('sha256')
    .update(canonicalJson({ plan, diary: diaryFingerprint(selection) }))
    .digest('hex');
}

export async function inspectPlan(userId: string, planId: string) {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const plan = await plans.readPlan(userId, planId, client);
    if (!plan)
      throw new FoodAssistantConflict('Plan not found or not owned by you.');
    const selection = await plans.readPlanDiary(userId, planId, client);
    return {
      ...plan,
      diary: selection,
      fingerprint: planFingerprint(plan, selection),
    };
  } finally {
    client.release();
  }
}

type ResolvedAssignment = {
  row: DiarySnapshot;
  leaves: DiarySnapshot[];
  parent?: Parameters<typeof writeVerifiedDiaryLog>[2]['parent'];
};
/** The same expansion drives the preview, scheduled diary and shopping list. */
export async function resolvePlan(
  userId: string,
  task: FoodAssistantTask,
  client?: PoolClient
) {
  const plan = task.checkpoint.plan;
  if (task.kind !== 'meal_plan' || !plan)
    throw new FoodAssistantConflict(
      'Save a meal-plan draft with all assignments before continuing.'
    );
  const dates: string[] = [];
  for (
    let date = plan.start_date;
    date <= plan.end_date;
    date = addDays(date, 1)
  ) {
    if (dates.length >= 90)
      throw new FoodAssistantConflict(
        'Use a plan window of at most 90 days; longer schedules can be saved in separate windows.'
      );
    dates.push(date);
  }
  const assignments: ResolvedAssignment[] = [];
  const issues: { assignment_id: string; message: string }[] = [];
  const estimated: string[] = [];
  for (const assignment of plan.assignments) {
    try {
      if (assignment.item_type === 'meal') {
        const resolved = await expandSavedMeal(
          userId,
          {
            meal_id: assignment.meal_id,
            quantity: assignment.quantity,
            unit: assignment.unit,
            expected_updated_at: assignment.expected_recipe_updated_at,
          },
          client
        );
        estimated.push(...resolved.estimated);
        assignments.push({
          row: snapshot.parse({
            id: assignment.id,
            day_of_week: assignment.day_of_week,
            meal_type_id: assignment.meal_type_id,
            item_type: 'meal',
            meal_id: assignment.meal_id,
            food_id: null,
            variant_id: null,
            quantity: resolved.portion.quantity,
            unit: resolved.portion.unit,
          }),
          leaves: resolved.leaves,
          parent: {
            name: resolved.meal.name,
            description: resolved.meal.description,
            images: resolved.meal.images,
            meal_template_id: resolved.meal.id,
            quantity: resolved.portion.quantity,
            unit: resolved.portion.unit,
            entry_total_servings:
              resolved.meal.serving_size * resolved.meal.total_servings,
          },
        });
      } else {
        const ingredient = task.checkpoint.ingredients.find(
          (row) => row.id === assignment.ingredient_id
        );
        if (
          !ingredient?.food_id ||
          ingredient.status === 'unresolved' ||
          ingredient.quantity === null ||
          !ingredient.unit
        )
          throw new FoodAssistantConflict(
            'Resolve the selected ingredient and its portion first.'
          );
        const food = await foodRepository.getFoodById(
          ingredient.food_id,
          userId,
          client,
          true
        );
        if (!food)
          throw new FoodAssistantConflict(
            'The selected food is no longer accessible.'
          );
        const resolved = resolveFoodSelection(food, {
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          variant_id: ingredient.variant_id,
        });
        if (!resolved.ok) throw new FoodAssistantConflict(resolved.message);
        if (resolved.estimated) estimated.push(ingredient.description);
        assignments.push({
          row: snapshot.parse({
            id: assignment.id,
            day_of_week: assignment.day_of_week,
            meal_type_id: assignment.meal_type_id,
            item_type: 'food',
            meal_id: null,
            food_id: ingredient.food_id,
            variant_id: resolved.snapshot.variant_id,
            quantity: resolved.snapshot.quantity,
            unit: resolved.snapshot.unit,
          }),
          leaves: [snapshot.parse(resolved.snapshot)],
        });
      }
    } catch (error) {
      if (
        !(error instanceof FoodAssistantConflict) &&
        !(error instanceof z.ZodError)
      )
        throw error;
      issues.push({ assignment_id: assignment.id, message: error.message });
    }
  }
  for (const ingredient of task.checkpoint.ingredients) {
    if (
      !plan.assignments.some(
        (row) => row.item_type === 'food' && row.ingredient_id === ingredient.id
      )
    )
      issues.push({
        assignment_id: ingredient.id,
        message: `${ingredient.description} has no plan assignment. Schedule it or explicitly remove it from the draft.`,
      });
    if (ingredient.status === 'unresolved')
      issues.push({
        assignment_id: ingredient.id,
        message:
          ingredient.issue ?? `${ingredient.description} remains unresolved.`,
      });
  }
  const schedule = dates.flatMap((date) =>
    assignments
      .filter((assignment) => assignment.row.day_of_week === dayOfWeek(date))
      .map((assignment) => ({ date, ...assignment }))
  );
  if (schedule.reduce((count, row) => count + row.leaves.length, 0) > 1500)
    throw new FoodAssistantConflict(
      'The schedule exceeds 1,500 food entries. Split it into shorter windows.'
    );
  return { plan, assignments, schedule, issues, estimated };
}

export async function previewPlan(userId: string, taskId: string) {
  const task = await tasks.getTask(userId, taskId);
  if (!task) throw new FoodAssistantConflict('Meal-plan task not found.');
  const resolved = await resolvePlan(userId, task);
  const goals = await goalService.getUserGoalsForRange(
    userId,
    resolved.plan.start_date,
    resolved.plan.end_date
  );
  return {
    task_id: task.id,
    version: task.version,
    plan: resolved.plan,
    issues: resolved.issues,
    estimated_ingredients: resolved.estimated,
    daily_nutrition: [...new Set(resolved.schedule.map((row) => row.date))].map(
      (date) => ({
        date,
        nutrition: diaryNutritionTotals(
          resolved.schedule
            .filter((row) => row.date === date)
            .flatMap((row) => row.leaves)
        ),
      })
    ),
    goals,
    preferences: await tasks.listPreferences(userId),
    scheduled_occurrences: resolved.schedule.length,
  };
}

function assertPlanReadback(expected: PlanSnapshot, actual: PlanSnapshot) {
  const fields = [
    'id',
    'user_id',
    'plan_name',
    'description',
    'start_date',
    'end_date',
    'is_active',
  ];
  if (
    fields.some(
      (field) =>
        canonicalJson(expected.plan[field] ?? null) !==
        canonicalJson(actual.plan[field] ?? null)
    ) ||
    expected.assignments.length !== actual.assignments.length ||
    expected.assignments.some(
      (row) =>
        !actual.assignments.some((stored) =>
          Object.entries(row).every(
            ([key, value]) =>
              canonicalJson(stored[key] ?? null) ===
              canonicalJson(value ?? null)
          )
        )
    )
  )
    throw new FoodAssistantConflict(
      'Persisted plan assignments did not match. Nothing was committed.'
    );
}

export async function publishPlan(
  userId: string,
  tz: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = publishFoodAssistantPlanSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'publish_meal_plan',
      request: input,
    },
    async (task, client) => {
      const resolved = await resolvePlan(userId, task, client);
      if (resolved.issues.length)
        throw new FoodAssistantConflict(
          `The plan remains incomplete: ${resolved.issues.map((row) => row.message).join(' ')}`
        );
      assertFoodEstimateAccepted(
        resolved.estimated.length > 0,
        input.estimate_source_quote,
        currentText
      );
      const before = input.plan_id
        ? await plans.readPlan(userId, input.plan_id, client, true)
        : null;
      if (input.plan_id && !before)
        throw new FoodAssistantConflict('Plan not found or not owned by you.');
      const beforeDiary = before
        ? await plans.readPlanDiary(userId, input.plan_id!, client, true)
        : empty();
      if (
        before &&
        planFingerprint(before, beforeDiary) !== input.expected_fingerprint
      )
        throw new FoodAssistantConflict(
          'The plan or its scheduled entries changed. Inspect them again.'
        );
      const today = todayInZone(tz);
      if (input.schedule && !resolved.schedule.some((row) => row.date >= today))
        throw new FoodAssistantConflict(
          'The selected schedule has no occurrences from today onward. Choose matching weekdays and a future date window, or save without scheduling.'
        );
      const futureIds = beforeDiary.entries
        .filter((row) => String(row.entry_date) >= today)
        .map(diary.snapshotId);
      if (
        futureIds.length &&
        (!input.confirmation_quote ||
          !currentText?.includes(input.confirmation_quote) ||
          !/\b(confirm|go ahead|yes.*replace|replace.*shown|replace.*preview)\b/i.test(
            input.confirmation_quote
          ))
      )
        throw new FoodAssistantConflict(
          'Preview the existing future entries and get confirmation before replacing this scheduled bulk selection.'
        );
      const planId = input.plan_id ?? randomUUID();
      const expected: PlanSnapshot = {
        plan: snapshot.parse({
          id: planId,
          user_id: userId,
          plan_name: resolved.plan.name,
          description: resolved.plan.description ?? null,
          start_date: resolved.plan.start_date,
          end_date: resolved.plan.end_date,
          is_active: input.schedule,
        }),
        assignments: resolved.assignments.map((assignment) => ({
          ...assignment.row,
          template_id: planId,
        })),
      };
      await plans.writePlan(client, userId, expected, !before);
      const removed = futureIds.length
        ? await diary.readSelection(
            userId,
            { type: 'entries', ids: futureIds },
            client,
            true
          )
        : empty();
      const retainedParents = futureIds.length
        ? await plans.removePlanDiary(client, userId, removed)
        : [];
      const newEntries: DiarySnapshot[] = [];
      if (input.schedule)
        for (const occurrence of resolved.schedule) {
          if (occurrence.date < today) continue;
          const logged = await writeVerifiedDiaryLog(userId, client, {
            snapshots: occurrence.leaves,
            destination: {
              date: occurrence.date,
              meal_type_id: String(occurrence.row.meal_type_id),
            },
            parent: occurrence.parent,
            template_id: planId,
          });
          newEntries.push(...logged.entries);
        }
      const after = await plans.readPlan(userId, planId, client);
      if (!after) throw new FoodAssistantConflict('Plan readback failed.');
      assertPlanReadback(expected, after);
      const afterDiary = await plans.readPlanDiary(userId, planId, client);
      for (const parent of retainedParents)
        if (!afterDiary.meals.some((row) => row.id === parent.id))
          afterDiary.meals.push(parent);
      assertDiaryReadback(
        [
          ...beforeDiary.entries.filter(
            (row) => !futureIds.includes(diary.snapshotId(row))
          ),
          ...newEntries,
        ],
        afterDiary.entries
      );
      await recomputeDiaryWater(client, userId, beforeDiary, afterDiary);
      return {
        ...task,
        status: 'complete',
        result: asJson({
          kind: 'meal_plan',
          publication_operation_id: input.operation_id,
          plan_id: planId,
          before,
          after,
          before_diary: beforeDiary,
          after_diary: afterDiary,
          shopping_sources: resolved.schedule.map((row) => ({
            date: row.date,
            foods: row.leaves,
          })),
          estimate_acceptance_quote: resolved.estimated.length
            ? input.estimate_source_quote
            : null,
        }),
      };
    }
  );
}

const publicationSchema = z.object({
  kind: z.literal('meal_plan'),
  publication_operation_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  before: plans.planSnapshotSchema.nullable(),
  after: plans.planSnapshotSchema,
  before_diary: selectionSchema,
  after_diary: selectionSchema,
});
export async function undoPlan(
  userId: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = undoFoodAssistantPlanSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'undo_meal_plan',
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
      const result = publicationSchema.safeParse(task.result);
      if (
        task.kind !== 'meal_plan' ||
        task.status !== 'complete' ||
        !result.success ||
        result.data.publication_operation_id !== input.publication_operation_id
      )
        throw new FoodAssistantConflict(
          'That publication is not the current completed plan task.'
        );
      const value = result.data,
        current = await plans.readPlan(userId, value.plan_id, client, true);
      const currentDiary = await plans.readPlanDiary(
        userId,
        value.plan_id,
        client,
        true
      );
      const knownParents = await diary.readSnapshots(
        client,
        'food_entry_meals',
        userId,
        value.after_diary.meals.map(diary.snapshotId),
        true
      );
      for (const parent of knownParents)
        if (!currentDiary.meals.some((row) => row.id === parent.id))
          currentDiary.meals.push(parent);
      if (
        !current ||
        planFingerprint(current, currentDiary) !==
          planFingerprint(value.after, value.after_diary)
      )
        throw new FoodAssistantConflict(
          'The plan or scheduled diary changed after publication. Undo would overwrite newer work.'
        );
      for (const parent of value.after_diary.meals.filter(
        (row) => !value.before_diary.meals.some((old) => old.id === row.id)
      )) {
        if (
          await diary.hasOtherMealEntries(
            client,
            userId,
            diary.snapshotId(parent),
            value.after_diary.entries.map(diary.snapshotId)
          )
        )
          throw new FoodAssistantConflict(
            'A scheduled meal now contains newer components. Undo cannot remove it.'
          );
      }
      // Historical rows that this publication preserved are never deleted or
      // rewritten while undoing its future schedule.
      const changedIds = value.after_diary.entries
        .filter(
          (row) =>
            !value.before_diary.entries.some(
              (old) =>
                old.id === row.id && canonicalJson(old) === canonicalJson(row)
            )
        )
        .map(diary.snapshotId);
      await assertAbsentDiaryIdentities(
        client,
        userId,
        value.before_diary,
        value.after_diary
      );
      if (changedIds.length)
        await plans.removePlanDiary(
          client,
          userId,
          await diary.readSelection(
            userId,
            { type: 'entries', ids: changedIds },
            client,
            true
          )
        );
      if (value.before)
        await plans.writePlan(client, userId, value.before, false);
      else await plans.deletePlan(client, userId, value.plan_id);
      for (const [table, key] of [
        ['food_entry_meals', 'meals'],
        ['food_entries', 'entries'],
        ['water_intake_entries', 'water'],
      ] as const) {
        for (const row of value.before_diary[key]) {
          const present = await diary.readSnapshots(client, table, userId, [
            diary.snapshotId(row),
          ]);
          if (
            present.length &&
            canonicalJson(present[0]) === canonicalJson(row)
          )
            continue;
          if (present.length)
            await diary.updateSnapshot(client, table, userId, row);
          else await diary.insertSnapshot(client, table, userId, row);
        }
      }
      const restored = value.before
        ? await plans.readPlanDiary(userId, value.plan_id, client)
        : empty();
      const restoredParents = await diary.readSnapshots(
        client,
        'food_entry_meals',
        userId,
        value.before_diary.meals.map(diary.snapshotId)
      );
      for (const parent of restoredParents)
        if (!restored.meals.some((row) => row.id === parent.id))
          restored.meals.push(parent);
      assertDiaryReadback(value.before_diary.entries, restored.entries);
      assertDiaryReadback(value.before_diary.meals, restored.meals);
      assertDiaryReadback(value.before_diary.water, restored.water);
      if (value.before) {
        const plan = await plans.readPlan(userId, value.plan_id, client);
        if (!plan)
          throw new FoodAssistantConflict('Restored plan readback failed.');
        assertPlanReadback(value.before, plan);
      }
      await recomputeDiaryWater(
        client,
        userId,
        value.before_diary,
        value.after_diary
      );
      return {
        ...task,
        result: asJson({
          kind: 'meal_plan_undo',
          publication_operation_id: input.publication_operation_id,
          plan_id: value.plan_id,
          after: restored,
        }),
      };
    }
  );
}
