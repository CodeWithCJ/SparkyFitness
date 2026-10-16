import {
  projectRuns,
  type ProgramSchedule,
  type RunProgramCompletion,
  type RunProgramEffort,
} from '@workspace/shared';

/**
 * Every workout of a program on one line of time: the ones done (with the day
 * and the diary entry they were done as), the one due, and the ones to come
 * (on the day the person's schedule puts them). Worked out afresh from the
 * place, so a missed workout moves the rest along.
 */

export type TimelineState =
  /** Behind the place: done (or skipped past). */
  | 'done'
  /** The workout due. */
  | 'next'
  /** Ahead of the place. */
  | 'upcoming';

export interface TimelineItem {
  /** Index into the program's workouts. */
  index: number;
  state: TimelineState;
  /**
   * The local day (YYYY-MM-DD): when it was done, or when the schedule puts
   * it. Null for a done workout with no record of when, and for one the
   * schedule cannot place (no weekdays chosen, or past the goal day).
   */
  day: string | null;
  /** The diary entry it was done as, when the program recorded one. */
  entryId: string | null;
  /** How hard it felt, 1 to 10, when rated. */
  rating: number | null;
}

export function buildProgramTimeline({
  total,
  next,
  completions,
  efforts,
  schedule,
  today,
  doneToday,
  isoToDay,
}: {
  total: number;
  /** Index of the workout due; `total` once the program is finished. */
  next: number;
  completions: readonly RunProgramCompletion[];
  efforts: readonly RunProgramEffort[];
  schedule: ProgramSchedule;
  today: string;
  /** A program workout was already completed today. */
  doneToday: boolean;
  /** The person's local day for an ISO timestamp. */
  isoToDay: (iso: string) => string;
}): TimelineItem[] {
  // Newest record wins when a workout was repeated.
  const completionFor = new Map<number, RunProgramCompletion>();
  for (const completion of completions) {
    completionFor.set(completion.index, completion);
  }
  const ratingFor = new Map<number, number>();
  for (const effort of efforts) ratingFor.set(effort.index, effort.rating);

  const projected = new Map(
    projectRuns({ total, next, schedule, today, doneToday }).map((run) => [
      run.index,
      run.day,
    ])
  );

  return Array.from({ length: total }, (_, index): TimelineItem => {
    const completion = completionFor.get(index);
    const rating = ratingFor.get(index) ?? null;
    if (index < next) {
      return {
        index,
        state: 'done',
        day: completion ? isoToDay(completion.at) : null,
        entryId: completion?.entry_id ?? null,
        rating,
      };
    }
    // With no weekdays chosen the Diary offers the due workout today (or on
    // the first day), so the calendar puts it there too.
    const dueDay =
      index === next && schedule.runDays.length === 0 && !doneToday
        ? schedule.startDay && schedule.startDay > today
          ? schedule.startDay
          : today
        : null;
    return {
      index,
      state: index === next ? 'next' : 'upcoming',
      day: projected.get(index) ?? dueDay,
      entryId: null,
      rating: null,
    };
  });
}

/** The items by day, in workout order within a day. */
export function itemsByDay(
  items: readonly TimelineItem[]
): Map<string, TimelineItem[]> {
  const byDay = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (!item.day) continue;
    byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  }
  return byDay;
}
