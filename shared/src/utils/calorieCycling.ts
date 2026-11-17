import {
  CALORIE_CYCLING_MAX_OFFSET,
  type CalorieCyclingMode,
} from '../constants/calorieConstants.ts';
import {
  isAdaptiveEarnBackSuppressed,
  normalizeCalorieGoalAdjustmentMode,
} from './calorieCalculations.ts';

/**
 * Calorie cycling (#2327): spread a weekly calorie budget over the weekdays, so
 * training days get more and rest days less while the week still adds up to the
 * day's target x 7. Pure; the server applies it to each day's goal and the web
 * and mobile previews call the same functions, so they always agree.
 */

export type CalorieCyclingDayType = 'high' | 'low' | 'even';

export type CalorieCyclingStatus =
  'off' | 'active' | 'paused_earn_back' | 'paused_weekly_plan';

export interface CycledDay {
  /** The day's calorie target after cycling, whole kcal. */
  target: number;
  /** target - base target, whole kcal. */
  delta: number;
  /** True when the day was held at the safety floor. */
  clampedToFloor: boolean;
}

export interface CalorieCyclingRules {
  calorie_cycling_mode?: CalorieCyclingMode | string | null;
  calorie_cycling_offsets?: readonly (number | string)[] | null;
  calorie_goal_adjustment_mode?: string | null;
  goal_mode_calculation_method?: string | null;
  adaptive_activity_separate?: boolean | null;
}

const DAYS = 7;

/**
 * A stored weekday pattern as 7 whole percentages within the allowed range, or
 * null when the value is not a usable pattern.
 */
export function parseCalorieCyclingOffsets(
  value: readonly (number | string)[] | null | undefined
): number[] | null {
  if (!Array.isArray(value) || value.length !== DAYS) return null;
  const offsets = value.map((entry) => Number(entry));
  if (
    offsets.some(
      (entry) =>
        !Number.isInteger(entry) || Math.abs(entry) > CALORIE_CYCLING_MAX_OFFSET
    )
  ) {
    return null;
  }
  return offsets;
}

/**
 * Whether the day's target can be cycled at all. Modes that add exercise
 * calories back already raise the target on the days a workout is logged, so
 * cycling on top would count training twice.
 */
export function isCalorieCyclingAvailable(rules: CalorieCyclingRules): boolean {
  const mode = normalizeCalorieGoalAdjustmentMode(
    rules.calorie_goal_adjustment_mode
  );
  if (mode === 'fixed' || mode === 'adaptive') return true;
  return isAdaptiveEarnBackSuppressed(
    rules.calorie_goal_adjustment_mode,
    rules.goal_mode_calculation_method,
    rules.adaptive_activity_separate
  );
}

/** The usable pattern when cycling is switched on, otherwise null. */
export function calorieCyclingPattern(
  rules: CalorieCyclingRules
): number[] | null {
  if (!rules.calorie_cycling_mode || rules.calorie_cycling_mode === 'off') {
    return null;
  }
  const offsets = parseCalorieCyclingOffsets(rules.calorie_cycling_offsets);
  if (!offsets || offsets.every((entry) => entry === offsets[0])) return null;
  return offsets;
}

function evenWeek(baseTarget: number): CycledDay[] {
  const target = Math.round(baseTarget);
  return Array.from({ length: DAYS }, () => ({
    target,
    delta: 0,
    clampedToFloor: false,
  }));
}

/**
 * The 7 day targets (index 0 = Sunday) for a base target and weekday pattern.
 *
 * Each raw percentage becomes a weight of 1 + p/100, and the weights are scaled
 * to average exactly 1, so the week totals base x 7 whatever the pattern. A day
 * that would fall below `floor` is held there, and the calories that costs are
 * taken from the other days in proportion to how far they sit above the floor,
 * so the week still adds up. A base target at or below the floor, or a pattern
 * with every day equal, leaves every day at the base target.
 */
export function cycleWeekTargets({
  baseTarget,
  offsets,
  floor,
}: {
  baseTarget: number;
  offsets: readonly number[] | null | undefined;
  floor: number | null | undefined;
}): CycledDay[] {
  const pattern = parseCalorieCyclingOffsets(offsets ?? null);
  if (!Number.isFinite(baseTarget) || baseTarget <= 0 || !pattern) {
    return evenWeek(baseTarget);
  }
  if (pattern.every((entry) => entry === pattern[0])) {
    return evenWeek(baseTarget);
  }
  const usableFloor =
    floor !== null && floor !== undefined && Number.isFinite(floor)
      ? floor
      : null;
  if (usableFloor !== null && baseTarget <= usableFloor) {
    return evenWeek(baseTarget);
  }

  const weights = pattern.map((entry) => 1 + entry / 100);
  const meanWeight = weights.reduce((sum, weight) => sum + weight, 0) / DAYS;
  let days = weights.map((weight) => ({
    target: (baseTarget * weight) / meanWeight,
    clampedToFloor: false,
  }));

  if (usableFloor !== null) {
    // Raising a day to the floor puts the week over budget; take the excess
    // from the unclamped days by their headroom. Proportional removal can never
    // push a day below the floor, because the week's total is above 7 x floor.
    for (let pass = 0; pass < DAYS; pass += 1) {
      if (
        !days.some((day) => !day.clampedToFloor && day.target < usableFloor)
      ) {
        break;
      }
      days = days.map((day) =>
        !day.clampedToFloor && day.target < usableFloor
          ? { target: usableFloor, clampedToFloor: true }
          : day
      );
      const excess =
        days.reduce((sum, day) => sum + day.target, 0) - baseTarget * DAYS;
      const totalHeadroom = days.reduce(
        (sum, day) =>
          day.clampedToFloor
            ? sum
            : sum + Math.max(0, day.target - usableFloor),
        0
      );
      if (totalHeadroom <= 0) return evenWeek(baseTarget);
      days = days.map((day) =>
        day.clampedToFloor
          ? day
          : {
              ...day,
              target:
                day.target -
                (excess * Math.max(0, day.target - usableFloor)) /
                  totalHeadroom,
            }
      );
    }
  }

  // Whole kcal. Days with the same percentage keep the same number, so the week
  // can differ from base x 7 by a few kcal of rounding.
  const roundedBase = Math.round(baseTarget);
  return days.map((day) => {
    const target = Math.round(day.target);
    return {
      target,
      delta: target - roundedBase,
      clampedToFloor: day.clampedToFloor,
    };
  });
}

/** One weekday's cycled target; `weekday` is 0 = Sunday, as `Date#getDay`. */
export function cycleDayTarget(params: {
  baseTarget: number;
  offsets: readonly number[] | null | undefined;
  weekday: number;
  floor: number | null | undefined;
}): CycledDay {
  const week = cycleWeekTargets(params);
  const target = Math.round(params.baseTarget);
  return week[params.weekday] ?? { target, delta: 0, clampedToFloor: false };
}

export function calorieCyclingDayType(delta: number): CalorieCyclingDayType {
  if (delta > 0) return 'high';
  if (delta < 0) return 'low';
  return 'even';
}

/**
 * Moves a cycled day's macros with its calories (4 kcal per gram of carbs and
 * protein, 9 per gram of fat). Carbs take the change; a low day bigger than
 * all of the day's carbs takes the rest from fat, and only past fat from
 * protein, so the macros never add up to more than the day's calories.
 * Protein is otherwise left alone. Never below zero.
 */
export function applyCalorieCyclingMacroDelta(
  macros: { protein: number; carbs: number; fat: number },
  deltaKcal: number
): { protein: number; carbs: number; fat: number } {
  const protein = Number(macros.protein);
  const carbs = Number(macros.carbs);
  const fat = Number(macros.fat);
  const round = (value: number) => Math.round(value * 10) / 10;
  if (!Number.isFinite(carbs)) return { protein, carbs, fat };
  const carbsAfter = carbs + deltaKcal / 4;
  if (carbsAfter >= 0 || !Number.isFinite(fat)) {
    return { protein, carbs: Math.max(0, round(carbsAfter)), fat };
  }
  // The part of a low day carbs could not cover, in kcal, comes off fat.
  const fatAfter = fat + (carbsAfter * 4) / 9;
  if (fatAfter >= 0 || !Number.isFinite(protein)) {
    return { protein, carbs: 0, fat: Math.max(0, round(fatAfter)) };
  }
  // A low day bigger than carbs and fat together (a very high protein split
  // with no safety floor) takes the remainder from protein.
  const proteinAfter = protein + (fatAfter * 9) / 4;
  return { protein: Math.max(0, round(proteinAfter)), carbs: 0, fat: 0 };
}

/** The stored pattern for training vs rest: training days +pct, rest days 0. */
export function trainingRestOffsets(
  trainingDays: readonly number[],
  percent: number
): number[] {
  const pct = Math.max(
    0,
    Math.min(CALORIE_CYCLING_MAX_OFFSET, Math.round(Number(percent) || 0))
  );
  return Array.from({ length: DAYS }, (_, day) =>
    trainingDays.includes(day) ? pct : 0
  );
}

/** Reads a training vs rest pattern back: the training days and their percentage. */
export function trainingRestFromOffsets(
  offsets: readonly (number | string)[] | null | undefined
): { trainingDays: number[]; percent: number } {
  const pattern = parseCalorieCyclingOffsets(offsets);
  if (!pattern) return { trainingDays: [], percent: 0 };
  const trainingDays = pattern.flatMap((entry, day) =>
    entry > 0 ? [day] : []
  );
  const percent = Math.max(0, ...pattern);
  return { trainingDays, percent };
}
