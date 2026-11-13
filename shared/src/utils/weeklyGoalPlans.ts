/** The dates of a weekly goal plan, as 'YYYY-MM-DD' strings. */
export interface WeeklyGoalPlanDates {
  start_date: string;
  /** null for a plan with no end date. */
  end_date: string | null;
}

/** Whether `day` ('YYYY-MM-DD') falls within the plan's dates. */
export function weeklyGoalPlanCovers(
  plan: WeeklyGoalPlanDates,
  day: string
): boolean {
  return (
    plan.start_date.slice(0, 10) <= day &&
    (plan.end_date === null || plan.end_date.slice(0, 10) >= day)
  );
}

/**
 * The plan that sets `day`'s goals: the switched-on plan covering it that
 * started last. Plans saved before overlaps were refused can still overlap.
 */
export function weeklyGoalPlanInForce<
  T extends WeeklyGoalPlanDates & { is_active: boolean },
>(plans: readonly T[], day: string): T | undefined {
  let inForce: T | undefined;
  for (const plan of plans) {
    if (
      plan.is_active &&
      weeklyGoalPlanCovers(plan, day) &&
      (!inForce ||
        plan.start_date.slice(0, 10) > inForce.start_date.slice(0, 10))
    ) {
      inForce = plan;
    }
  }
  return inForce;
}
