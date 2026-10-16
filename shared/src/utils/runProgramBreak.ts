import { daysBetween } from "./timezone.ts";

/** Days since the last program workout at which easing back in is offered. */
export const BREAK_SHORT_DAYS = 14;
export const BREAK_LONG_DAYS = 28;

export interface BreakSuggestion {
  daysAway: number;
  /** Change to the running in the next `count` workouts (negative eases). */
  percent: number;
  count: number;
}

/**
 * After a break from the program, easing the next few workouts is safer than
 * picking up where the person left off: two weeks away eases the next two
 * workouts by 15%, four weeks the next three by 25%. Null when the break is
 * short, the program is finished or not started, or the person already
 * adjusted the plan since their last workout, on that day or later (so it is
 * never offered twice).
 * Days are the person's local YYYY-MM-DD.
 */
export function suggestFromBreak(input: {
  lastDoneDay: string | null;
  today: string;
  next: number;
  total: number;
  /**
   * The person's local day the plan was last changed on. An instant would be a
   * UTC date, which can name a different day than `lastDoneDay` does.
   */
  lastAdjustedDay?: string | null;
}): BreakSuggestion | null {
  const { lastDoneDay, today, next, total, lastAdjustedDay } = input;
  if (!lastDoneDay || next <= 0 || next >= total) return null;
  const daysAway = daysBetween(lastDoneDay, today);
  if (daysAway < BREAK_SHORT_DAYS) return null;
  if (lastAdjustedDay && lastAdjustedDay >= lastDoneDay) return null;
  return daysAway >= BREAK_LONG_DAYS
    ? { daysAway, percent: -25, count: 3 }
    : { daysAway, percent: -15, count: 2 };
}
