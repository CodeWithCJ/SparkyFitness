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
}

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
      .getLatestWeightHeight(userId)
      .catch(() => ({ weightKg: null, heightCm: null })),
  ]);

  const stepsByDate = new Map<string, number>();
  for (const row of checkInRows as CheckInStepsRow[]) {
    stepsByDate.set(row.entry_date, Number(row.steps) || 0);
  }

  const byDate = new Map<string, ResolvedExerciseCalorieDay>();
  for (const split of splits) {
    const activeCalories = Number(split.active_calories) || 0;
    const loggedCalories = Number(split.other_calories) || 0;
    const activitySteps = Number(split.activity_steps) || 0;

    const stepCalories = resolveBackgroundStepCalories({
      totalSteps: stepsByDate.get(split.entry_date) ?? 0,
      activitySteps,
      weightKg: latestWeightHeight.weightKg,
      heightCm: latestWeightHeight.heightCm,
    });

    const resolved = resolveExerciseCalories(
      loggedCalories,
      activeCalories,
      stepCalories
    );

    byDate.set(split.entry_date, {
      date: split.entry_date,
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
