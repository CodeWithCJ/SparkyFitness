import goalService from './goalService.js';
import foodEntryService from './foodEntryService.js';
import { getExerciseEntriesByDateV2 } from './exerciseEntryHistoryService.js';
import measurementRepository from '../models/measurementRepository.js';
import foodRepository from '../models/foodMisc.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  computeCalorieBalance,
  extractExerciseStats,
  resolveDayFraction,
  sumFoodEntryCalories,
} from './calorieBalanceService.js';
import type { ExerciseSessionResponse } from '@workspace/shared';
import { resolveSupplementTotals } from '@workspace/shared';

interface DailySummaryOptions {
  actorUserId: string;
  targetUserId: string;
  date: string;
  includeCheckin: boolean;
}

export async function getDailySummary({
  actorUserId,
  targetUserId,
  date,
  includeCheckin,
}: DailySummaryOptions) {
  // Each function acquires its own pool client, allowing true parallel execution.
  const [
    goals,
    adjustedGoals,
    foodEntries,
    exerciseSessions,
    waterResult,
    userProfile,
    userPreferences,
    measurements,
    supplementTotals,
  ] = await Promise.all([
    goalService.getUserGoals(targetUserId, date, undefined, false),
    goalService.getUserGoals(targetUserId, date, undefined, true),
    foodEntryService.getFoodEntriesByDate(actorUserId, targetUserId, date),
    getExerciseEntriesByDateV2(targetUserId, date),
    includeCheckin
      ? measurementRepository
          .getWaterIntakeByDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `Water intake fetch failed for user ${targetUserId} on ${date}, defaulting to 0:`,
              error
            );
            return null;
          })
      : null,
    userRepository.getUserProfile(targetUserId),
    preferenceRepository.getUserPreferences(targetUserId),
    includeCheckin
      ? measurementRepository
          .getLatestCheckInMeasurementsOnOrBeforeDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `Measurements fetch failed for user ${targetUserId} on ${date}:`,
              error
            );
            return null;
          })
      : null,
    // Supplement nutrition is diary data and this whole route is gated on `diary`
    // (dailySummaryRoutes:9), so this adds no reach the caller did not already have
    // through foodEntries. Failure degrades to zeros rather than failing the summary:
    // a missing supplement arm understates the day, a 500 shows the user nothing.
    foodRepository
      .getDailySupplementTotals(targetUserId, date)
      .catch((error: unknown) => {
        log(
          'warn',
          `Supplement totals fetch failed for user ${targetUserId} on ${date}, defaulting to zeros:`,
          error
        );
        // Must stay the same width as the query's own result. A hardcoded five-key
        // literal here would reintroduce #2145 on the degraded path alone, which is
        // the hardest version to notice.
        //
        // Built fresh rather than handing back `EMPTY_SUPPLEMENT_TOTALS` itself: this
        // value goes into the response object, so returning the shared constant would
        // put one process-wide object on every degraded response, and anything that
        // later folded into it would corrupt the constant for every caller after.
        // A shallow spread would not be enough either, since `custom_nutrients` would
        // still alias.
        return resolveSupplementTotals(null);
      }),
  ]);

  // Split once and reuse: the step-calorie query needs `activitySteps` to work out which
  // steps a logged workout already charged for, and the balance needs all three sums.
  // Deriving them twice from the same session tree is how the two drift apart.
  const exerciseStats = extractExerciseStats(
    exerciseSessions as ExerciseSessionResponse[]
  );

  const stepCalories = includeCheckin
    ? await measurementRepository.getStepCaloriesForDate(
        targetUserId,
        date,
        exerciseStats.activitySteps
      )
    : 0;

  // External BMR override — only when opted in AND checkin data is permitted
  // (includeCheckin is the route's permission gate; the override must not bypass it).
  const externalBmr =
    userPreferences?.use_external_bmr && includeCheckin
      ? await measurementRepository
          .getExternalBmrForDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `External BMR fetch failed for user ${targetUserId} on ${date}:`,
              error
            );
            return null;
          })
      : null;

  const calorieBalance = computeCalorieBalance({
    eatenCalories:
      sumFoodEntryCalories(foodEntries) + supplementTotals.calories,
    exercise: exerciseStats,
    backgroundStepCalories: stepCalories,
    adjustedGoalCalories:
      Number((adjustedGoals as Record<string, unknown> | null)?.calories) ||
      2000,
    userProfile,
    userPreferences,
    measurements,
    externalBmr,
    // A past day is finished, so its burn needs no end-of-day projection. Reading the
    // wall clock here (as this did before) made the same historical day report different
    // numbers depending on when you opened it.
    dayFraction: resolveDayFraction(date, userPreferences?.timezone || 'UTC'),
  });

  const rawGoalData = goals as Record<string, unknown> | null;
  const adjustedGoalData = adjustedGoals as Record<string, unknown> | null;
  const rawCalories = Number(rawGoalData?.calories) || 2000;
  const adjCalories = Number(adjustedGoalData?.calories) || rawCalories;

  const computedAdjustedGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null =
    adjCalories !== rawCalories
      ? {
          calories: Math.round(adjCalories),
          protein: Math.round(Number(adjustedGoalData?.protein) || 0),
          carbs: Math.round(Number(adjustedGoalData?.carbs) || 0),
          fat: Math.round(Number(adjustedGoalData?.fat) || 0),
        }
      : null;

  return {
    goals,
    foodEntries,
    exerciseSessions,
    waterIntake: parseFloat(waterResult?.water_ml) || 0,
    stepCalories,
    calorieBalance,
    adjustedGoals: computedAdjustedGoals,
    // Exposed separately as well as folded into `calorieBalance.eaten`, so the Diary can
    // show what supplements contributed instead of leaving a gap between the headline
    // total and the food rows underneath it.
    supplementTotals,
  };
}
