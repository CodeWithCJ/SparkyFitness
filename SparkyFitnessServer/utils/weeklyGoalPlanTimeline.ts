import { addDays } from '@workspace/shared';
import type { WeeklyGoalPlanDates } from '@workspace/shared';

export interface PlacedWeeklyGoalPlan extends WeeklyGoalPlanDates {
  id: string;
  plan_name: string;
}

export type WeeklyGoalPlanPlacement =
  | {
      ok: true;
      /** Plans to end the day before the saved plan starts. */
      end: Array<{ id: string; end_date: string }>;
      /** Plans the saved plan replaces outright (same start date). */
      deactivate: string[];
    }
  | { ok: false; overlaps: PlacedWeeklyGoalPlan };

const OPEN_END = '9999-12-31';

/**
 * Where a switched-on plan fits among the user's other switched-on plans, so
 * that at most one plan covers any day and a past day keeps the plan it had.
 *
 * Switching to a plan that starts on or after every other plan is what moving
 * to a new plan looks like: the plan in force is ended the day before, or
 * replaced when it starts the same day. Any other overlap is refused rather
 * than rewriting days the user did not touch.
 */
export function placeWeeklyGoalPlan(
  others: PlacedWeeklyGoalPlan[],
  plan: WeeklyGoalPlanDates,
  switching: boolean
): WeeklyGoalPlanPlacement {
  const start = plan.start_date;
  const end = plan.end_date ?? OPEN_END;
  const overlapping = others
    .filter(
      (other) =>
        other.start_date <= end && (other.end_date ?? OPEN_END) >= start
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (overlapping.length === 0) return { ok: true, end: [], deactivate: [] };

  const startsLast = others.every((other) => other.start_date <= start);
  if (!switching || !startsLast) {
    return { ok: false, overlaps: overlapping[0] };
  }
  return {
    ok: true,
    end: overlapping
      .filter((other) => other.start_date < start)
      .map((other) => ({ id: other.id, end_date: addDays(start, -1) })),
    deactivate: overlapping
      .filter((other) => other.start_date === start)
      .map((other) => other.id),
  };
}
