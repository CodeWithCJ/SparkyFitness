import { isDayString, normalizeEnergyUnit } from '@workspace/shared';

import type {
  GarminGoalNutrient,
  GarminGoalsTopic,
  GarminSnapshotPayload,
  WatchContextPayload,
  WatchGoalNutrientPayload,
} from '../../modules/watch-connectivity';

/**
 * The Garmin watch app's snapshot, projected from the context the Apple Watch
 * and Wear OS get (`agent-docs/garmin.md`, "Protocol"). Pure: the time and the
 * day come from the context, so the same push always gives the same snapshot.
 *
 * Connect IQ messages never carry null, so a value that is missing is left
 * out of the dictionary rather than sent as null or undefined.
 */
export function buildGarminSnapshot(
  context: WatchContextPayload
): GarminSnapshotPayload {
  return {
    pushedAt: context.pushedAt,
    today: context.today,
    owner:
      typeof context.workoutServerId === 'string'
        ? context.workoutServerId
        : '',
    topics: {
      goals: goalsTopic(context),
    },
  };
}

function goalsTopic(context: WatchContextPayload): GarminGoalsTopic {
  const energyUnit = normalizeEnergyUnit(context.energyUnit);
  const { caloriesConsumed, caloriesBurned, caloriesRemaining } = context;
  // The phone blanks the calorie figures when it cannot vouch for today (a
  // push that crossed midnight), which is the only day signal the context
  // has. A watch given no `day` shows its not-synced state rather than a
  // confident zero or yesterday's numbers.
  if (
    !isFiniteNumber(caloriesConsumed) ||
    !isFiniteNumber(caloriesBurned) ||
    !isFiniteNumber(caloriesRemaining) ||
    !isDayString(context.today)
  ) {
    return { energyUnit };
  }
  return {
    energyUnit,
    day: context.today,
    consumed: wholeNumber(caloriesConsumed),
    burned: wholeNumber(caloriesBurned),
    remaining: wholeNumber(caloriesRemaining),
    progress: fraction(context.calorieGoalProgress),
    nutrients: (context.goalNutrients ?? []).flatMap((row) => {
      const nutrient = goalNutrient(row);
      return nutrient ? [nutrient] : [];
    }),
  };
}

/**
 * A row missing its key, label or amount is skipped rather than drawn as a
 * zero, as the Apple Watch does. A goal of 0 is no goal, and so is one that
 * rounds to 0: the watch would otherwise draw a bar against nothing.
 */
function goalNutrient(
  row: WatchGoalNutrientPayload
): GarminGoalNutrient | null {
  if (
    typeof row.key !== 'string' ||
    typeof row.label !== 'string' ||
    !isFiniteNumber(row.consumed)
  ) {
    return null;
  }
  const goal = isFiniteNumber(row.goal) ? wholeNumber(row.goal) : 0;
  const base = {
    key: row.key,
    label: row.label,
    unit: typeof row.unit === 'string' ? row.unit : '',
    consumed: wholeNumber(row.consumed),
  };
  return goal > 0
    ? { ...base, goal, progress: fraction(row.progress) }
    : { ...base, progress: 0 };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Rounded, with -0 (from rounding a small negative) sent as 0. */
function wholeNumber(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** 0...1, and 0 when absent. The phone clamps already; this keeps it so. */
function fraction(value: number | null | undefined): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
