import { addDays, compareDays, dayOfWeek } from "./timezone.ts";

/**
 * When a run program's workouts fall, from the person's place in it and the
 * weekdays they chose. The calendar is always worked out from the next workout
 * due, so a run that is missed simply moves everything after it along.
 */

export interface ProgramSchedule {
  /** Weekdays the person runs, 0 = Sunday; empty means whenever they like. */
  runDays: readonly number[];
  /** First day a workout may fall on, or null for from today. */
  startDay: string | null;
  /** The person's goal day, or null. Nothing is scheduled after it. */
  endDay: string | null;
}

export interface ScheduledRun {
  /** Index into the program's workouts. */
  index: number;
  /** The day (YYYY-MM-DD) it falls on. */
  day: string;
}

/**
 * Lays the remaining workouts, from `next`, onto the chosen weekdays, one per
 * day, starting today (or the start day, or tomorrow once today's workout is
 * done). Empty when no weekdays are chosen. `limit` stops early.
 */
export function projectRuns({
  total,
  next,
  schedule,
  today,
  doneToday,
  limit = total,
}: {
  total: number;
  next: number;
  schedule: ProgramSchedule;
  today: string;
  /** A program workout was already completed today. */
  doneToday: boolean;
  limit?: number;
}): ScheduledRun[] {
  const days = new Set(schedule.runDays);
  if (days.size === 0) return [];
  let cursor = today;
  if (doneToday) cursor = addDays(today, 1);
  if (schedule.startDay && compareDays(schedule.startDay, cursor) > 0) {
    cursor = schedule.startDay;
  }
  const runs: ScheduledRun[] = [];
  for (let index = next; index < total && runs.length < limit; index++) {
    // At most a week to the next chosen weekday.
    for (let step = 0; step < 7 && !days.has(dayOfWeek(cursor)); step++) {
      cursor = addDays(cursor, 1);
    }
    if (schedule.endDay && compareDays(cursor, schedule.endDay) > 0) break;
    runs.push({ index, day: cursor });
    cursor = addDays(cursor, 1);
  }
  return runs;
}

/**
 * The day the last workout falls on, ignoring the goal day, so a goal that is
 * too close can be told apart from one with room to spare. Null when no
 * weekdays are chosen or nothing is left.
 */
export function projectedFinishDay({
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
}): string | null {
  if (next >= total) return null;
  const runs = projectRuns({
    total,
    next,
    schedule: { ...schedule, endDay: null },
    today,
    doneToday,
  });
  return runs.at(-1)?.day ?? null;
}

export interface DiaryProgramRun {
  kind: "scheduled" | "upNext";
  /** Index of the workout to show. */
  index: number;
}

/**
 * The program workout the Diary offers on `date`, if any. With weekdays chosen
 * it follows the calendar above (so future days show what is coming). With none
 * it offers the next workout, today only. Nothing before the start day, after
 * the goal day, once a workout was done today, or when the program is off or
 * finished.
 */
export function programRunForDate({
  enabled,
  total,
  next,
  schedule,
  doneDay,
  today,
  date,
}: {
  enabled: boolean;
  total: number;
  next: number;
  schedule: ProgramSchedule;
  /** The local day a program workout was last completed. */
  doneDay: string | null;
  today: string;
  date: string;
}): DiaryProgramRun | null {
  if (!enabled || next >= total) return null;
  if (compareDays(date, today) < 0) return null;
  if (schedule.endDay && compareDays(date, schedule.endDay) > 0) return null;
  const doneToday = doneDay === today;
  if (schedule.runDays.length === 0) {
    if (date !== today || doneToday) return null;
    if (schedule.startDay && compareDays(today, schedule.startDay) < 0) {
      return null;
    }
    return { kind: "upNext", index: next };
  }
  const run = projectRuns({
    total,
    next,
    schedule,
    today,
    doneToday,
    limit: 60,
  }).find((r) => r.day === date);
  return run ? { kind: "scheduled", index: run.index } : null;
}
