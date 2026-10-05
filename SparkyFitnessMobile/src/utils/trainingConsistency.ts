import type { TrainingConsistency } from '@workspace/shared';
import { addDays } from '@workspace/shared';

export type CalendarCell = 'trained' | 'rest' | 'future';

export interface CalendarWeek {
  weekStart: string;
  /** The week's seven days, starting on the account's first day of the week. */
  cells: { day: string; state: CalendarCell }[];
}

/**
 * The heat-map grid: one column per week, its days down in week order. Days after
 * `today` are `future` so the current week's tail is not drawn as missed.
 */
export function trainingCalendarWeeks(
  data: Pick<TrainingConsistency, 'today' | 'weeks' | 'trainingDays'>
): CalendarWeek[] {
  const trained = new Set(data.trainingDays);
  return data.weeks.map((week) => ({
    weekStart: week.weekStart,
    cells: Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(week.weekStart, offset);
      const state: CalendarCell =
        day > data.today ? 'future' : trained.has(day) ? 'trained' : 'rest';
      return { day, state };
    }),
  }));
}

export interface MuscleWeekRow {
  muscle: string;
  thisWeek: number;
  lastWeek: number;
}

/** Muscles trained this week or last, most sets this week first. */
export function muscleWeekRows(
  muscleSets: TrainingConsistency['muscleSets']
): MuscleWeekRow[] {
  const muscles = new Set([
    ...Object.keys(muscleSets.thisWeek),
    ...Object.keys(muscleSets.lastWeek),
  ]);
  return [...muscles]
    .map((muscle) => ({
      muscle,
      thisWeek: muscleSets.thisWeek[muscle] ?? 0,
      lastWeek: muscleSets.lastWeek[muscle] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.thisWeek - a.thisWeek ||
        b.lastWeek - a.lastWeek ||
        a.muscle.localeCompare(b.muscle)
    );
}

/**
 * Which grid rows get a weekday label (the 2nd, 4th and 6th), so the labels
 * stay legible at the size the squares are drawn.
 */
export const WEEKDAY_LABEL_ROWS: readonly number[] = [1, 3, 5];

/**
 * Weekday name for each grid row. `names` is indexed 0 = Sunday, as
 * `getCalendarWeekdayShortNames` returns it.
 */
export function weekdayRowLabels(
  firstDayOfWeek: number,
  names: readonly string[]
): string[] {
  return Array.from(
    { length: 7 },
    (_, row) => names[(firstDayOfWeek + row) % 7] ?? ''
  );
}

/**
 * The month name to draw above a week's column: set on the first column and on
 * each column whose week starts in a new month, empty elsewhere.
 */
export function monthColumnLabels(
  weekStarts: readonly string[],
  monthNames: readonly string[]
): string[] {
  let previousMonth = -1;
  return weekStarts.map((weekStart) => {
    const month = Number(weekStart.slice(5, 7)) - 1;
    if (month === previousMonth) return '';
    previousMonth = month;
    return monthNames[month] ?? '';
  });
}
