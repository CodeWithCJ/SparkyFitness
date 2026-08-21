import goalService from './goalService.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import { resolveBackgroundStepCalories } from '@workspace/shared';
import {
  computeCalorieBalance,
  resolveDayFraction,
} from './calorieBalanceService.js';

/**
 * Aggregates stats for external dashboards (like gethomepage.dev).
 *
 * Delegates the arithmetic to `computeCalorieBalance`, the same function behind
 * `/api/daily-summary` and `/api/daily-summary/range`, so a Homepage widget shows the
 * number the Diary shows. This file used to hand-inline its own copy of that math, which
 * had drifted in four ways: it never subtracted workout steps from check-in steps (its
 * `activitySteps` was always 0 because the query it read does not select `steps`), it
 * carried its own copy of the stride formula, it clamped progress to 100 where the app
 * does not, and it read the wall clock even when asked for a past date.
 */
async function getDashboardStats(
  userId: string,
  date: string,
  includeCheckin = true
) {
  try {
    const [
      goals,
      nutritionData,
      exerciseSplits,
      userProfile,
      userPreferences,
      measurements,
      checkInMeasurements,
      latestWeightHeight,
    ] = await Promise.all([
      // `adjust` is unconditionally true, matching `dailySummaryService` and
      // `dailySummaryRangeService`. It used to be tied to `includeCheckin`, which made
      // this endpoint the only one of the three to report an unadjusted goal for a
      // family viewer holding `diary` but not `checkin` — the same class of
      // surface-by-surface divergence as #2094, just one surface further out.
      //
      // Gating it bought no privacy either: `adjust` derives the goal from the target's
      // own measurements, and that same actor can already read the adjusted number from
      // GET /daily-summary and GET /daily-summary/range, both of which pass true.
      goalService.getUserGoals(userId, date, undefined, true),
      reportRepository.getNutritionData(userId, date, date, []),
      // Replaces a forEach over `reportRepository.getExerciseEntries`, whose SELECT omits
      // `steps` — so the old `activitySteps` was always 0 and every step a logged workout
      // already accounted for was charged a second time as "background".
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
        userId,
        date,
        date
      ),
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      includeCheckin
        ? measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
            userId,
            date
          )
        : null,
      includeCheckin
        ? measurementRepository.getCheckInMeasurementsByDate(userId, date)
        : null,
      includeCheckin
        ? measurementRepository.getLatestWeightHeight(userId)
        : { weightKg: null, heightCm: null },
    ]);

    // External BMR override — gated on includeCheckin, matching dailySummaryService.
    const externalBmr =
      userPreferences?.use_external_bmr && includeCheckin
        ? await measurementRepository
            .getExternalBmrForDate(userId, date)
            .catch((error: unknown) => {
              log(
                'warn',
                `DashboardService: external BMR fetch failed for user ${userId} on ${date}:`,
                error
              );
              return null;
            })
        : null;

    const split = exerciseSplits[0];
    const exercise = {
      activeCalories: Number(split?.active_calories) || 0,
      otherCalories: Number(split?.other_calories) || 0,
      activitySteps: Number(split?.activity_steps) || 0,
    };

    const steps = parseInt(String(checkInMeasurements?.steps ?? '0'), 10) || 0;
    const stepCalories = includeCheckin
      ? resolveBackgroundStepCalories({
          totalSteps: steps,
          activitySteps: exercise.activitySteps,
          weightKg: latestWeightHeight.weightKg,
          heightCm: latestWeightHeight.heightCm,
        })
      : 0;

    const balance = computeCalorieBalance({
      eatenCalories:
        nutritionData.length > 0
          ? parseFloat(nutritionData[0].calories) || 0
          : 0,
      exercise,
      backgroundStepCalories: stepCalories,
      adjustedGoalCalories:
        parseFloat(String((goals as { calories?: unknown })?.calories)) || 2000,
      userProfile,
      userPreferences,
      measurements,
      externalBmr,
      dayFraction: resolveDayFraction(date, userPreferences?.timezone || 'UTC'),
    });

    return {
      eaten: balance.eaten,
      burned: balance.burned,
      remaining: balance.remaining,
      goal: balance.goal,
      net: balance.net,
      progress: balance.progress,
      steps,
      stepCalories,
      bmr: balance.bmr,
      unit: 'kcal',
    };
  } catch (error) {
    log(
      'error',
      `Error calculating Dashboard stats for user ${userId}:`,
      error
    );
    throw error;
  }
}

export { getDashboardStats };
export default {
  getDashboardStats,
};
