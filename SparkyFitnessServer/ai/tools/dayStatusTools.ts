import { tool } from 'ai';
import { z } from 'zod';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import dashboardService from '../../services/DashboardService.js';
import goalService from '../../services/goalService.js';
import nutrientGoalPreferenceService from '../../services/nutrientGoalPreferenceService.js';
import reportRepository from '../../models/reportRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatJsonResult } from './formatting.js';
import { optionalDateSchema } from './schemas/common.js';
import { normalizeDayKeywords } from './dates.js';

const dayStatusSchema = z
  .object({
    date: optionalDateSchema.describe(
      "YYYY-MM-DD, today or yesterday, in the user's timezone. Defaults to today."
    ),
  })
  .strict();

// Output key -> [daily totals column, goals column].
const MACROS = {
  protein: ['protein', 'protein'],
  carbs: ['carbs', 'carbs'],
  fat: ['fat', 'fat'],
  fiber: ['fiber', 'dietary_fiber'],
} as const;

interface DashboardStatsView {
  eaten?: unknown;
  burned?: unknown;
  remaining?: unknown;
  goal?: unknown;
}

const MEAL_FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;

interface GoalTypeView {
  goalType?: string;
  targetMin?: number;
  targetMax?: number;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const roundOrNull = (value: unknown) => {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
};

// A goal of 0 is how an unset macro goal is stored; report it as no goal
// rather than "over by everything eaten".
const goalOrNull = (value: unknown) => {
  const parsed = num(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

function mealRow(
  meal_type: string,
  entries: number,
  values: Record<string, number>
) {
  return {
    meal_type,
    entries,
    calories: Math.round(values.calories),
    protein: round1(values.protein),
    carbs: round1(values.carbs),
    fat: round1(values.fat),
    fiber: round1(values.fiber),
  };
}

function direction(type: GoalTypeView | undefined) {
  if (!type?.goalType) return undefined;
  if (type.goalType === 'target') {
    return {
      direction: 'target',
      target_min: type.targetMin ?? null,
      target_max: type.targetMax ?? null,
    };
  }
  return { direction: type.goalType };
}

export function buildDayStatusTools(userId: string, tz: string) {
  return {
    sparky_get_day_status: tool({
      description:
        "One-call status for a day: calories and macros (protein, carbs, fat, fiber) consumed, goal and remaining, each goal's direction (minimum, maximum or target range), and per-meal subtotals. Calories match the dashboard: remaining already accounts for burned calories the way the user's settings count them. Macro remaining is goal minus consumed; negative means over the goal. Taken supplements are listed as their own by_meal row. A goal of null means none is set. Read-only. Defaults to today in the user's timezone.",
      inputSchema: dayStatusSchema,
      execute: async (rawArgs) => {
        const parsed = dayStatusSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) return formatZodError(parsed.error);
        const date = parsed.data.date ?? todayInZone(tz);
        try {
          const [stats, totalsRows, goals, goalTypes, meals] =
            await Promise.all([
              dashboardService.getDashboardStats(
                userId,
                date
              ) as unknown as Promise<DashboardStatsView>,
              reportRepository.getDailyNutritionTotalsRange(userId, date, date),
              goalService.getUserGoals(
                userId,
                date,
                undefined,
                true
              ) as Promise<Record<string, unknown>>,
              nutrientGoalPreferenceService.getEffectiveGoalTypes(
                userId
              ) as Promise<Record<string, GoalTypeView>>,
              reportRepository.getMealNutritionTotals(userId, date),
            ]);
          const totals = (totalsRows[0] ?? {}) as Record<string, unknown>;

          const calories: Record<string, unknown> = {
            consumed: roundOrNull(stats?.eaten) ?? 0,
            goal: roundOrNull(stats?.goal),
            remaining: roundOrNull(stats?.remaining),
            burned: roundOrNull(stats?.burned) ?? 0,
            ...direction(goalTypes?.calories),
          };

          const nutrition: Record<string, unknown> = { calories };
          for (const [key, [totalsCol, goalCol]] of Object.entries(MACROS)) {
            const consumed = round1(num(totals[totalsCol]) ?? 0);
            const goal = goalOrNull(goals?.[goalCol]);
            nutrition[key] = {
              consumed,
              goal: goal === null ? null : round1(goal),
              remaining: goal === null ? null : round1(goal - consumed),
              ...direction(goalTypes?.[goalCol]),
            };
          }

          const byMeal = meals.map((row: Record<string, unknown>) =>
            mealRow(
              typeof row.meal_type === 'string' ? row.meal_type : 'Unassigned',
              Number(row.entries) || 0,
              Object.fromEntries(
                MEAL_FIELDS.map((field) => [field, num(row[field]) ?? 0])
              )
            )
          );
          // The day totals add taken supplements; the meals do not. Show the
          // difference as its own row so the meals add up to the day.
          const supplements = Object.fromEntries(
            MEAL_FIELDS.map((field) => [
              field,
              (num(totals[field]) ?? 0) -
                meals.reduce(
                  (sum: number, row: Record<string, unknown>) =>
                    sum + (num(row[field]) ?? 0),
                  0
                ),
            ])
          );
          const supplementRow = mealRow(
            'Supplements',
            0,
            Object.fromEntries(
              MEAL_FIELDS.map((field) => [
                field,
                Math.max(0, supplements[field]),
              ])
            )
          );
          // Judged after rounding, so 0.4 g of fiber still shows.
          if (MEAL_FIELDS.some((field) => supplementRow[field] > 0)) {
            byMeal.push(supplementRow);
          }

          return formatJsonResult({
            date,
            timezone: tz,
            nutrition,
            by_meal: byMeal,
          });
        } catch (error) {
          log('error', '[Day Status Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
