import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  addDays,
  daysBetween,
  todayInZone,
  foodAssistantAnalysisDraftSchema,
  changeFoodAssistantTaskSchema,
  type FoodAssistantAnalysisDraft,
} from '@workspace/shared';
import * as data from '../models/foodAssistantAnalysisRepository.js';
import type { AnalysisEntry } from '../models/foodAssistantAnalysisRepository.js';
import * as tasks from '../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import goalService from './goalService.js';
import { canonicalJson } from '../utils/canonicalJson.js';
import {
  nutrientNumber,
  resolveFoodPortion,
} from '../utils/foodPortionResolver.js';
import {
  validateNamedFoodReference,
  type Nutrient,
} from '../utils/foodNutritionSnapshot.js';
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
/** Missing records and missing nutrients are distinct. These are recorded
 * amounts, never an inference that a logged day captures all actual intake. */
export function summarizeNutrition(
  entries: AnalysisEntry[],
  range: { start_date: string; end_date: string },
  nutrients: Nutrient[],
  goals: Record<string, unknown>
) {
  const issues: Array<{ entry_id: string; date: string; message: string }> = [];
  const consumed = entries.map((row) => {
    const quantity = nutrientNumber(row.quantity),
      size = nutrientNumber(row.serving_size);
    const reference = {
      serving_size: size,
      serving_unit:
        typeof row.serving_unit === 'string' ? row.serving_unit : null,
    };
    const portion =
      quantity !== null && typeof row.unit === 'string'
        ? resolveFoodPortion({
            quantity,
            unit: row.unit,
            variants: [reference],
            explicitVariant: reference,
          })
        : null;
    const factor =
      portion?.ok && size !== null ? portion.quantity / size : null;
    if (factor === null)
      issues.push({
        entry_id: String(row.id),
        date: String(row.entry_date),
        message:
          portion && !portion.ok
            ? portion.message
            : 'Quantity, unit or serving reference is missing. This entry cannot be calculated.',
      });
    else {
      const issue = validateNamedFoodReference(String(row.food_name ?? ''), {
        ...reference,
        calories: nutrientNumber(row.calories),
        protein: nutrientNumber(row.protein),
        carbs: nutrientNumber(row.carbs),
        fat: nutrientNumber(row.fat),
        alcohol_g: nutrientNumber(row.alcohol_g),
      });
      if (issue)
        issues.push({
          entry_id: String(row.id),
          date: String(row.entry_date),
          message:
            issue + ' The recorded values are retained, with this warning.',
        });
    }
    const values = Object.fromEntries(
      nutrients.map((field) => {
        const n = nutrientNumber(row[field]);
        return [
          field,
          factor !== null && n !== null && n >= 0 && Number.isFinite(n * factor)
            ? n * factor
            : null,
        ] as const;
      })
    ) as Record<Nutrient, number | null>;
    return { date: String(row.entry_date), values };
  });
  const days = [];
  for (
    let date = range.start_date;
    date <= range.end_date;
    date = addDays(date, 1)
  ) {
    const rows = consumed.filter((row) => row.date === date),
      goal = goals[date];
    const goalValues =
      goal && typeof goal === 'object' ? (goal as Record<string, unknown>) : {};
    const values = Object.fromEntries(
      nutrients.map((field) => {
        const known = rows.flatMap((row) =>
            row.values[field] === null ? [] : [row.values[field]!]
          ),
          missing = rows.length - known.length;
        const knownTotal = known.length
            ? known.reduce((sum, value) => sum + value, 0)
            : null,
          total = rows.length && missing === 0 ? knownTotal : null;
        const target =
          field === 'water_ml' ? null : nutrientNumber(goalValues[field]);
        const usableGoal = target !== null && target >= 0 ? target : null;
        return [
          field,
          {
            known_total: knownTotal,
            total,
            known_entries: known.length,
            missing_entries: missing,
            goal: usableGoal,
            goal_gap:
              total !== null && usableGoal !== null ? total - usableGoal : null,
          },
        ] as const;
      })
    );
    days.push({
      date,
      entry_count: rows.length,
      logged: rows.length > 0,
      nutrients: values,
    });
  }
  const loggedDays = days.filter((day) => day.logged),
    metrics = Object.fromEntries(
      nutrients.map((field) => {
        const daily = loggedDays.map((day) => day.nutrients[field]!),
          known = daily.flatMap((value) =>
            value.known_total === null ? [] : [value.known_total]
          ),
          complete = daily.filter((value) => value.total !== null),
          comparable = complete.filter((value) => value.goal !== null);
        return [
          field,
          {
            known_total: known.length
              ? known.reduce((sum, value) => sum + value, 0)
              : null,
            total:
              daily.length && complete.length === daily.length
                ? complete.reduce((sum, value) => sum + value.total!, 0)
                : null,
            average_per_logged_day:
              daily.length && complete.length === daily.length
                ? average(complete.map((value) => value.total!))
                : null,
            average_on_complete_reference_days: average(
              complete.map((value) => value.total!)
            ),
            complete_reference_days: complete.length,
            known_entries: daily.reduce(
              (sum, value) => sum + value.known_entries,
              0
            ),
            missing_entries: daily.reduce(
              (sum, value) => sum + value.missing_entries,
              0
            ),
            goal_comparable_days: comparable.length,
            average_goal: average(comparable.map((value) => value.goal!)),
            average_daily_goal_gap: average(
              comparable.map((value) => value.goal_gap!)
            ),
          },
        ] as const;
      })
    );
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    calendar_days: days.length,
    logged_days: loggedDays.length,
    unlogged_days: days.length - loggedDays.length,
    entry_count: entries.length,
    nutrients: metrics,
    days,
    issues,
  };
}
async function capture(
  userId: string,
  range: { start_date: string; end_date: string },
  fields: Nutrient[],
  client?: PoolClient
) {
  const entries = await data.readAnalysisEntries(
    userId,
    range.start_date,
    range.end_date,
    client
  );
  const goals = await goalService.getUserGoalsForRange(
    userId,
    range.start_date,
    range.end_date,
    false
  );
  const result = summarizeNutrition(entries, range, fields, goals);
  return {
    ...result,
    evidence: {
      source: 'food_entries snapshots',
      fingerprint: createHash('sha256')
        .update(canonicalJson({ entries, goals }))
        .digest('hex'),
      entry_ids: entries.map((row) => row.id),
    },
  };
}
export async function analyzeNutrition(
  userId: string,
  tz: string,
  raw: unknown,
  client?: PoolClient
) {
  const input: FoodAssistantAnalysisDraft =
      foodAssistantAnalysisDraftSchema.parse(raw),
    today = todayInZone(tz);
  for (const range of [input, input.compare].filter(
    (value): value is NonNullable<typeof value> => !!value
  )) {
    if (daysBetween(range.start_date, range.end_date) >= 90)
      throw new FoodAssistantConflict(
        'Select at most 90 calendar days per analysis period.'
      );
    if (range.end_date > today)
      throw new FoodAssistantConflict(
        'Nutrition analysis uses recorded history. Select dates through today; use plan preview for future schedules.'
      );
  }
  const current = await capture(userId, input, input.nutrients, client),
    comparison = input.compare
      ? await capture(userId, input.compare, input.nutrients, client)
      : null;
  const changes = comparison
    ? Object.fromEntries(
        input.nutrients.map((field) => {
          const a = current.nutrients[field]!.average_per_logged_day,
            b = comparison.nutrients[field]!.average_per_logged_day;
          return [
            field,
            {
              average_per_logged_day_change:
                a !== null && b !== null ? a - b : null,
              current_logged_days: current.logged_days,
              comparison_logged_days: comparison.logged_days,
            },
          ] as const;
        })
      )
    : null;
  return {
    kind: 'nutrition_analysis' as const,
    captured_at: new Date().toISOString(),
    timezone: tz,
    goal_basis: 'Calendar goals before exercise adjustments.',
    current,
    comparison,
    changes,
    includes_partial_today:
      input.end_date === today || input.compare?.end_date === today,
    limitations: [
      'Unlogged days are unknown, never zero intake.',
      'Logged days are not confirmed complete intake. Missing reference nutrients remain unknown.',
      'Goal gaps compare recorded food with calendar goals before exercise adjustments, not assessed adequacy or an energy deficit.',
      'Patterns are descriptive; they do not establish causes or diagnoses.',
      'water_ml covers food snapshots only. Drinking-water history is separate.',
    ],
  };
}
export async function saveNutritionAnalysis(
  userId: string,
  tz: string,
  taskId: string,
  raw: unknown
) {
  const command = changeFoodAssistantTaskSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: command.operation_id,
      expectedVersion: command.expected_version,
      kind: 'save_nutrition_analysis',
      request: command,
    },
    async (task, client) => {
      if (task.kind !== 'analysis' || !task.checkpoint.analysis)
        throw new FoodAssistantConflict(
          'Save an analysis task with its date ranges and selected nutrients first.'
        );
      const result = await analyzeNutrition(
        userId,
        tz,
        task.checkpoint.analysis,
        client
      );
      return {
        ...task,
        status: 'complete',
        result: json({
          ...result,
          publication_operation_id: command.operation_id,
        }),
      };
    }
  );
}
