/**
 * The aggregates behind sparky_get_health_summary, sparky_get_30_day_trends,
 * sparky_get_daily_exercise_totals and sparky_get_daily_report, run against
 * real rows: nutrition averages are per logged day and agree with
 * sparky_get_nutrition_summary, a device's daily "Active Calories" row is not a
 * workout, and the daily steps total comes back as a number.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import { buildCoachTools } from '../ai/tools/coachTools.js';
import coachRepository from '../models/coachRepository.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
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

describe.runIf(RUN)('chatbot coach and exercise aggregates', () => {
  const db = ownerClient();
  const userId = randomUUID();
  let mealTypeId: string;

  const addFood = async (
    entryDate: string,
    per100: { calories: number; protein: number; carbs: number; fat: number },
    quantity = 100
  ) => {
    await db.query(
      `INSERT INTO public.food_entries
         (user_id, meal_type_id, entry_date, food_name, quantity, unit,
          serving_size, serving_unit, calories, protein, carbs, fat)
       VALUES ($1, $2, $3, 'Test food', $4, 'g', 100, 'g', $5, $6, $7, $8)`,
      [
        userId,
        mealTypeId,
        entryDate,
        quantity,
        per100.calories,
        per100.protein,
        per100.carbs,
        per100.fat,
      ]
    );
  };

  const addExercise = async (name: string) =>
    (
      await db.query(
        `INSERT INTO public.exercises (user_id, name, source, category)
         VALUES ($1, $2, 'custom', 'custom') RETURNING id`,
        [userId, name]
      )
    ).rows[0].id as string;

  const addExerciseEntry = async (
    exerciseId: string | null,
    name: string | null,
    entryDate: string,
    values: {
      duration: number;
      calories: number;
      distance?: number;
      steps?: number;
    }
  ) => {
    await db.query(
      `INSERT INTO public.exercise_entries
         (user_id, exercise_id, exercise_name, entry_date, duration_minutes,
          calories_burned, distance, steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        exerciseId,
        name,
        entryDate,
        values.duration,
        values.calories,
        values.distance ?? null,
        values.steps ?? null,
      ]
    );
  };

  const cleanUp = async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public.exercises WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM public.food_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
  };

  beforeAll(async () => {
    await db.connect();
    const mealType = await db.query(
      'SELECT id FROM public.meal_types WHERE user_id IS NULL ORDER BY name LIMIT 1'
    );
    if (!mealType.rows[0]) {
      throw new Error('No default meal type seeded; run the migrations first.');
    }
    mealTypeId = mealType.rows[0].id;
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `coach-aggregates-${userId}@example.test`]
    );

    try {
      // Day 1: three entries, 100 g protein in total. Day 2: one entry of
      // 150 g of a food with 40 g protein per 100 g, so 60 g protein.
      await addFood('2026-06-01', {
        calories: 300,
        protein: 30,
        carbs: 10,
        fat: 5,
      });
      await addFood('2026-06-01', {
        calories: 300,
        protein: 30,
        carbs: 10,
        fat: 5,
      });
      await addFood('2026-06-01', {
        calories: 400,
        protein: 40,
        carbs: 10,
        fat: 5,
      });
      await addFood(
        '2026-06-02',
        { calories: 400, protein: 40, carbs: 20, fat: 10 },
        150
      );

      // Day 1: the device's daily Active Calories row plus a lifting session.
      // Day 2: a run, and a workout with no name (still a workout).
      // Day 3: only the Active Calories row, a rest day.
      const activeCalories = await addExercise('Active Calories');
      const bench = await addExercise('Bench Press');
      const running = await addExercise('Running');
      await addExerciseEntry(activeCalories, 'Active Calories', '2026-06-01', {
        duration: 0,
        calories: 500,
      });
      await addExerciseEntry(bench, 'Bench Press', '2026-06-01', {
        duration: 45,
        calories: 200,
      });
      await addExerciseEntry(running, 'Running', '2026-06-02', {
        duration: 25.5,
        calories: 250,
        distance: 3.01,
        steps: 3500,
      });
      await addExerciseEntry(null, null, '2026-06-02', {
        duration: 10,
        calories: 50,
      });
      await addExerciseEntry(activeCalories, 'Active Calories', '2026-06-03', {
        duration: 0,
        calories: 400,
      });
    } catch (error) {
      await cleanUp();
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await cleanUp();
    } finally {
      await db.end();
      await endPool();
    }
  });

  it('averages nutrition per logged day and agrees with the nutrition summary', async () => {
    const tools = buildCoachTools(userId, 'UTC');
    const text = (await tools.sparky_get_health_summary.execute!(
      { start_date: '2026-06-01', end_date: '2026-06-07' },
      toolOpts
    )) as string;
    const summary = JSON.parse(text.slice(text.indexOf('{')));

    expect(summary.nutrition).toEqual({
      total_calories: 1600,
      days_logged: 2,
      avg_daily_calories: 800,
      avg_daily_protein: 80,
      avg_daily_carbs: 30,
      avg_daily_fat: 15,
      entry_count: 4,
    });

    const days = await reportRepository.getDailyNutritionTotalsRange(
      userId,
      '2026-06-01',
      '2026-06-07'
    );
    const protein = days.reduce(
      (sum: number, day: { protein: number }) => sum + Number(day.protein),
      0
    );
    expect(
      summary.nutrition.avg_daily_protein * summary.nutrition.days_logged
    ).toBeCloseTo(protein, 1);
    expect(summary.fitness.workout_count).toBe(3);
  });

  it('does not count Active Calories rows as workouts in the health summary', async () => {
    const row = await coachRepository.getExerciseAggregates(
      userId,
      '2026-06-01',
      '2026-06-03'
    );
    expect(row.workout_count).toBe(3);
  });

  it('does not count Active Calories rows as workouts or active days over 30 days', async () => {
    const row = await coachRepository.get30DayExerciseAggregates(
      userId,
      '2026-06-03'
    );
    expect(row.total_workouts).toBe(3);
    expect(row.active_days).toBe(2);
  });

  it('counts only workouts per day and returns the daily totals as numbers', async () => {
    const rows = await exerciseEntryDb.getDailyExerciseTotalsRange(
      userId,
      '2026-06-01',
      '2026-06-03'
    );
    const byDate = Object.fromEntries(
      rows.map((r: { entry_date: string }) => [r.entry_date, r])
    );

    expect(byDate['2026-06-01'].entry_count).toBe(1);
    expect(byDate['2026-06-02'].entry_count).toBe(2);
    // A rest day keeps its row, so the device's calories stay visible.
    expect(byDate['2026-06-03'].entry_count).toBe(0);
    expect(byDate['2026-06-03'].calories_burned).toBe(400);

    const runDay = byDate['2026-06-02'];
    expect(runDay.steps).toBe(3500);
    expect(runDay.distance).toBe(3.01);
    expect(runDay.duration_minutes).toBe(35.5);
    expect(runDay.calories_burned).toBe(300);
  });
});
