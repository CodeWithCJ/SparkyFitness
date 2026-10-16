import { compareDays } from "./timezone.ts";
import {
  projectedFinishDay,
  type ProgramSchedule,
} from "./runProgramSchedule.ts";

/** The most workouts one catch-up may skip, so a big gap is never papered over. */
export const MAX_CATCH_UP_SKIP = 3;

export type CatchUp =
  /** Nothing to do: no goal day or run days, nothing left, or it already fits. */
  | { state: "fits" }
  /** Skipping `skip` workouts (the next ones) makes the last land on `finishDay`. */
  | { state: "skip"; skip: number; next: number; finishDay: string }
  /** Further behind than a catch-up may make up; `late` is how many workouts do not fit. */
  | { state: "tooFar"; late: number };

/**
 * Whether a program with a goal day still ends in time, and if not, how few of
 * the next workouts to skip so it does. The last workout (the race, in a race
 * plan) is never skipped.
 */
export function catchUpFor({
  total,
  next,
  schedule,
  today,
  doneToday,
}: {
  total: number;
  next: number;
  schedule: ProgramSchedule;
  today: string;
  doneToday: boolean;
}): CatchUp {
  const { endDay } = schedule;
  if (!endDay || schedule.runDays.length === 0 || next >= total) {
    return { state: "fits" };
  }
  const finishFor = (from: number): string | null =>
    projectedFinishDay({ total, next: from, schedule, today, doneToday });
  const first = finishFor(next);
  if (!first || compareDays(first, endDay) <= 0) return { state: "fits" };
  const lastIndex = total - 1;
  for (let skip = 1; skip <= MAX_CATCH_UP_SKIP; skip++) {
    const from = next + skip;
    if (from > lastIndex) break;
    const finishDay = finishFor(from);
    if (finishDay && compareDays(finishDay, endDay) <= 0) {
      return { state: "skip", skip, next: from, finishDay };
    }
  }
  // Count how many do not fit as things stand.
  let late = 0;
  for (let from = next; from < total; from++) {
    const finishDay = finishFor(from);
    if (finishDay && compareDays(finishDay, endDay) <= 0) break;
    late++;
  }
  return { state: "tooFar", late };
}
