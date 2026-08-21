import goalService from './goalService.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  computeCalorieBalance,
  resolveDayFraction,
  type CalorieBalanceMeasurements,
} from './calorieBalanceService.js';
import {
  addDays,
  compareDays,
  resolveBackgroundStepCalories,
} from '@workspace/shared';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

/**
 * Per-day calorie balance over a date range.
 *
 * Exists so the Reports page can stop deriving this in the browser (issue #2094). It runs
 * the same `computeCalorieBalance` the Diary uses, day by day, over inputs fetched **once**
 * for the whole window. Looping `getDailySummary` instead would be ~13 queries per day —
 * roughly 1,170 for a 90-day report, with a real pool-exhaustion risk — so every input
 * below is a ranged query and the day loop itself does no I/O.
 *
 * Modelled on `AdaptiveTdeeService.calculateAdaptiveTdeeRange`.
 */

export interface DailySummaryRangeOptions {
  targetUserId: string;
  startDate: string;
  endDate: string;
  /**
   * Whether the caller may see check-in data. Steps and external BMR both live in
   * `check_in_measurements`, so this is the same gate `/api/daily-summary` applies —
   * which is what keeps Reports and the Diary degrading identically for a family viewer.
   */
  includeCheckin: boolean;
}

export interface DailySummaryRangeResult {
  days: DailyCalorieBalanceRow[];
}

interface CheckInRow {
  entry_date: string;
  steps?: number | string | null;
  weight?: number | string | null;
  height?: number | string | null;
  body_fat_percentage?: number | string | null;
}

/**
 * Body-composition fields the BMR formula reads. Each is carried forward on its own,
 * mirroring the per-field subselects in `getLatestCheckInMeasurementsOnOrBeforeDate`.
 */
const MEASUREMENT_FIELDS = [
  'weight',
  'height',
  'body_fat_percentage',
] as const satisfies readonly (keyof CalorieBalanceMeasurements)[];

/**
 * Every calendar day from start to end inclusive, as YYYY-MM-DD.
 *
 * Uses the shared day-string helpers rather than parsing into host-local `Date` objects,
 * so the values never round-trip through an instant that a timezone could shift.
 */
function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cursor = startDate;
  while (compareDays(cursor, endDate) <= 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export async function getDailySummaryRange({
  targetUserId,
  startDate,
  endDate,
  includeCheckin,
}: DailySummaryRangeOptions): Promise<DailySummaryRangeResult> {
  const [
    nutritionRows,
    goalsByDate,
    exerciseSplits,
    checkInRows,
    seedMeasurement,
    latestWeightHeight,
    userProfile,
    userPreferences,
  ] = await Promise.all([
    // Only `calories` is needed, so the custom-nutrient catalog is deliberately not
    // passed — it would inflate the dynamic SQL for columns nothing here reads.
    reportRepository.getNutritionData(targetUserId, startDate, endDate, []),
    goalService.getUserGoalsForRange(targetUserId, startDate, endDate, true),
    exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
      targetUserId,
      startDate,
      endDate
    ),
    includeCheckin
      ? measurementRepository
          .getCheckInMeasurementsByDateRange(targetUserId, startDate, endDate)
          .catch((error: unknown) => {
            log(
              'warn',
              `Check-in range fetch failed for user ${targetUserId} (${startDate}..${endDate}):`,
              error
            );
            return [];
          })
      : [],
    // Day one still needs a body composition to compute BMR from, and the most recent
    // measurement may predate the window entirely.
    includeCheckin
      ? measurementRepository
          .getLatestCheckInMeasurementsOnOrBeforeDate(targetUserId, startDate)
          .catch(() => null)
      : null,
    includeCheckin
      ? measurementRepository
          .getLatestWeightHeight(targetUserId)
          .catch(() => ({ weightKg: null, heightCm: null }))
      : { weightKg: null, heightCm: null },
    userRepository.getUserProfile(targetUserId),
    preferenceRepository.getUserPreferences(targetUserId),
  ]);

  const externalBmrByDate =
    userPreferences?.use_external_bmr && includeCheckin
      ? await measurementRepository
          .getExternalBmrByDateRange(targetUserId, startDate, endDate)
          .catch((error: unknown) => {
            log(
              'warn',
              `External BMR range fetch failed for user ${targetUserId}:`,
              error
            );
            return new Map<string, number>();
          })
      : new Map<string, number>();

  const eatenByDate = new Map<string, number>();
  for (const row of nutritionRows as Array<{
    date: string;
    calories?: unknown;
  }>) {
    eatenByDate.set(row.date, Number(row.calories) || 0);
  }

  const splitByDate = new Map(
    exerciseSplits.map((split) => [split.entry_date, split])
  );

  // Sorted ascending once, then walked with a cursor in the day loop. Filtering and
  // re-sorting per day would be O(days x measurements) for no reason.
  //
  // Fields are carried forward INDEPENDENTLY rather than by whole row, because that is
  // what `getLatestCheckInMeasurementsOnOrBeforeDate` (the per-date Diary path) does:
  // it resolves each column to its own latest non-null, positive value. A check-in row
  // that records only `steps` would otherwise blank out weight and height for that day
  // and every day after, silently dropping BMR to the 70kg/175cm defaults.
  const measurementsAsc = (checkInRows as CheckInRow[])
    .slice()
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const stepsByDate = new Map<string, number>();
  for (const row of measurementsAsc) {
    stepsByDate.set(row.entry_date, Number(row.steps) || 0);
  }

  const tz = userPreferences?.timezone || 'UTC';
  const now = new Date();

  let measurementCursor = 0;
  const carried: CalorieBalanceMeasurements = {
    weight: (seedMeasurement as CalorieBalanceMeasurements | null)?.weight,
    height: (seedMeasurement as CalorieBalanceMeasurements | null)?.height,
    body_fat_percentage: (seedMeasurement as CalorieBalanceMeasurements | null)
      ?.body_fat_percentage,
  };

  const days: DailyCalorieBalanceRow[] = [];

  for (const date of enumerateDays(startDate, endDate)) {
    while (
      measurementCursor < measurementsAsc.length &&
      measurementsAsc[measurementCursor].entry_date <= date
    ) {
      const row = measurementsAsc[measurementCursor];
      for (const field of MEASUREMENT_FIELDS) {
        const value = Number(row[field]);
        if (row[field] !== null && row[field] !== undefined && value > 0) {
          carried[field] = row[field];
        }
      }
      measurementCursor += 1;
    }

    const split = splitByDate.get(date);
    const exercise = {
      activeCalories: Number(split?.active_calories) || 0,
      otherCalories: Number(split?.other_calories) || 0,
      activitySteps: Number(split?.activity_steps) || 0,
    };

    const totalSteps = includeCheckin ? (stepsByDate.get(date) ?? 0) : 0;

    const stepCalories = includeCheckin
      ? resolveBackgroundStepCalories({
          totalSteps,
          activitySteps: exercise.activitySteps,
          weightKg: latestWeightHeight.weightKg,
          heightCm: latestWeightHeight.heightCm,
        })
      : 0;

    const dayGoals = (goalsByDate as Record<string, { calories?: unknown }>)[
      date
    ];

    days.push({
      date,
      stepCalories,
      ...computeCalorieBalance({
        eatenCalories: eatenByDate.get(date) ?? 0,
        exercise,
        backgroundStepCalories: stepCalories,
        adjustedGoalCalories: Number(dayGoals?.calories) || 2000,
        userProfile,
        userPreferences,
        measurements: carried,
        externalBmr: externalBmrByDate.get(date) ?? null,
        dayFraction: resolveDayFraction(date, tz, now),
      }),
    });
  }

  return { days };
}

export default { getDailySummaryRange };
