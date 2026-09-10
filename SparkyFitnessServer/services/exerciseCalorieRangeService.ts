import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import { log } from '../config/logging.js';
import {
  resolveBackgroundStepCalories,
  resolveExerciseCalories,
  type ExerciseCalorieSource,
} from '@workspace/shared';

/**
 * Resolved exercise calories per day, for surfaces that report "calories burned" but do
 * not need a full calorie balance.
 *
 * The chatbot and MCP report tools used to answer with a plain `SUM(calories_burned)`
 * over `exercise_entries`. That adds a device's "Active Calories" summary on top of the
 * logged workouts it already contains -- so Sparky would answer 906 kcal for a day the
 * Diary showed as 717. Same defect as issue #2094, different surface.
 *
 * This applies the one rule the whole app uses: max(device summary, logged + background
 * steps), never the sum.
 */

export interface ResolvedExerciseCalorieDay {
  date: string;
  /** max(active, logged + background steps) — what the Diary reports as burned. */
  calories: number;
  /** Which arm won, for callers that want to explain the number. */
  source: ExerciseCalorieSource;
  /** Background step kcal that fed the resolution. */
  stepCalories: number;
  /** Logged workout kcal, excluding the device summary row. */
  loggedCalories: number;
  /** The device's "Active Calories" summary row, if any. */
  activeCalories: number;
}

interface CheckInStepsRow {
  entry_date: string;
  steps?: number | string | null;
  weight?: number | string | null;
  height?: number | string | null;
}

/**
 * Returns resolved calories for days with exercise or check-ins in the inclusive range.
 * Weight and height carry forward independently, seeded from the latest prior value
 * or the earliest later value when no prior measurement exists.
 */
export async function getResolvedExerciseCaloriesRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, ResolvedExerciseCalorieDay>> {
  const [splits, checkInRows, latestWeightHeight] = await Promise.all([
    exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
      userId,
      startDate,
      endDate
    ),
    measurementRepository
      .getCheckInMeasurementsByDateRange(userId, startDate, endDate)
      .catch((error: unknown) => {
        log(
          'warn',
          `Resolved exercise calories: check-in fetch failed for ${userId}:`,
          error
        );
        return [];
      }),
    measurementRepository
      .getLatestWeightHeight(userId, startDate)
      .catch(() => ({ weightKg: null, heightCm: null })),
  ]);

  const checkInByDate = new Map(
    (checkInRows as CheckInStepsRow[]).map((row) => [row.entry_date, row])
  );

  const splitByDate = new Map(splits.map((split) => [split.entry_date, split]));

  // Iterate the union, not just the exercise splits. `getDailyExerciseCalorieSplitRange`
  // groups over `exercise_entries`, so a day with check-in steps and no logged exercise
  // produces no row at all -- and that day's step calories would vanish from the totals
  // the health-summary and 30-day tools report. That shape is common: it is exactly the
  // steps-only day from issue #2094.
  const dates = new Set([...splitByDate.keys(), ...checkInByDate.keys()]);

  const byDate = new Map<string, ResolvedExerciseCalorieDay>();
  let { weightKg, heightCm } = latestWeightHeight;
  for (const date of [...dates].sort()) {
    const checkIn = checkInByDate.get(date);
    if (Number(checkIn?.weight) > 0) weightKg = Number(checkIn?.weight);
    if (Number(checkIn?.height) > 0) heightCm = Number(checkIn?.height);
    const split = splitByDate.get(date);
    const activeCalories = Number(split?.active_calories) || 0;
    const loggedCalories = Number(split?.other_calories) || 0;
    const activitySteps = Number(split?.activity_steps) || 0;

    const stepCalories = resolveBackgroundStepCalories({
      totalSteps: Number(checkIn?.steps) || 0,
      activitySteps,
      weightKg,
      heightCm,
    });

    const resolved = resolveExerciseCalories(
      loggedCalories,
      activeCalories,
      stepCalories
    );

    byDate.set(date, {
      date,
      calories: resolved.calories,
      source: resolved.source,
      stepCalories,
      loggedCalories,
      activeCalories,
    });
  }

  return byDate;
}

/** Total resolved exercise calories across a range, for period-summary surfaces. */
export async function getResolvedExerciseCaloriesTotal(
  userId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const byDate = await getResolvedExerciseCaloriesRange(
    userId,
    startDate,
    endDate
  );
  let total = 0;
  for (const day of byDate.values()) total += day.calories;
  return Math.round(total);
}

export default {
  getResolvedExerciseCaloriesRange,
  getResolvedExerciseCaloriesTotal,
};
