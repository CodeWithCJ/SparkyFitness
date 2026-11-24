/**
 * sparky_get_day_status against real rows: per-meal subtotals add up to the
 * day's food totals, and the macros match sparky_get_nutrition_summary.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import { buildDayStatusTools } from '../ai/tools/dayStatusTools.js';
import reportRepository from '../models/reportRepository.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();
const DATE = '2026-03-10';

describe.runIf(RUN)('sparky_get_day_status', () => {
  const db = ownerClient();
  const userId = randomUUID();
  let mealTypes: { id: string; name: string }[];

  const addFood = async (
    mealTypeId: string,
    quantity: number,
    per100: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    }
  ) => {
    await db.query(
      `INSERT INTO public.food_entries
         (user_id, meal_type_id, entry_date, food_name, quantity, unit,
          serving_size, serving_unit, calories, protein, carbs, fat, dietary_fiber)
       VALUES ($1, $2, $3, 'Test food', $4, 'g', 100, 'g', $5, $6, $7, $8, $9)`,
      [
        userId,
        mealTypeId,
        DATE,
        quantity,
        per100.calories,
        per100.protein,
        per100.carbs,
        per100.fat,
        per100.fiber,
      ]
    );
  };

  const cleanUp = async () => {
    await db.query('DELETE FROM public.food_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
  };

  beforeAll(async () => {
    await db.connect();
    mealTypes = (
      await db.query(
        `SELECT id, name FROM public.meal_types
          WHERE user_id IS NULL ORDER BY sort_order, name LIMIT 2`
      )
    ).rows;
    if (mealTypes.length < 2) {
      throw new Error('Default meal types not seeded; run the migrations.');
    }
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `day-status-${userId}@example.test`]
    );
    // Two entries in the first meal (one at 150 g), one in the second.
    await addFood(mealTypes[0].id, 150, {
      calories: 47,
      protein: 8,
      carbs: 5,
      fat: 0.5,
      fiber: 2,
    });
    await addFood(mealTypes[0].id, 100, {
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 8,
      fiber: 4,
    });
    await addFood(mealTypes[1].id, 50, {
      calories: 400,
      protein: 20,
      carbs: 40,
      fat: 16,
      fiber: 6,
    });
  });

  afterAll(async () => {
    await cleanUp().catch(() => {});
    await db.end().catch(() => {});
    await endPool();
  });

  it('groups the day by meal in meal-type order, scaled by quantity', async () => {
    const rows = await reportRepository.getMealNutritionTotals(userId, DATE);
    expect(rows).toEqual([
      {
        meal_type: mealTypes[0].name,
        entries: 2,
        calories: 270.5,
        protein: 22,
        carbs: 27.5,
        fat: 8.75,
        fiber: 7,
      },
      {
        meal_type: mealTypes[1].name,
        entries: 1,
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 8,
        fiber: 3,
      },
    ]);
  });

  it('returns macros that match the nutrition summary and meals that add up', async () => {
    const tools = buildDayStatusTools(userId, 'UTC');
    const out = JSON.parse(
      (await tools.sparky_get_day_status.execute!(
        { date: DATE },
        toolOpts
      )) as string
    );
    const [summary] = await reportRepository.getDailyNutritionTotalsRange(
      userId,
      DATE,
      DATE
    );

    expect(out.nutrition.protein.consumed).toBe(Number(summary.protein));
    expect(out.nutrition.carbs.consumed).toBe(Number(summary.carbs));
    expect(out.nutrition.calories.consumed).toBe(
      Math.round(Number(summary.calories))
    );
    const mealCalories = out.by_meal.reduce(
      (sum: number, meal: { calories: number }) => sum + meal.calories,
      0
    );
    expect(
      Math.abs(mealCalories - out.nutrition.calories.consumed)
    ).toBeLessThanOrEqual(1);
  });
});
