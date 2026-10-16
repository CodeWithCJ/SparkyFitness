import { addDays, dayOfWeek } from '@workspace/shared';

export interface MonthGridDay {
  /** YYYY-MM-DD */
  day: string;
  /** Whether the day belongs to the month shown rather than a neighbour. */
  inMonth: boolean;
}

/** "2026-10" for a day in October 2026. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** The month before or after `month` (YYYY-MM), `delta` months away. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  const y = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${y}-${String(mm).padStart(2, '0')}`;
}

/**
 * The weeks to draw for `month` (YYYY-MM): whole weeks starting on
 * `firstDayOfWeek` (0 = Sunday), padded with the neighbouring months' days.
 */
export function monthGridWeeks(
  month: string,
  firstDayOfWeek: number
): MonthGridDay[][] {
  const first = `${month}-01`;
  const lead = (dayOfWeek(first) - firstDayOfWeek + 7) % 7;
  let cursor = addDays(first, -lead);
  const weeks: MonthGridDay[][] = [];
  do {
    const week: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ day: cursor, inMonth: monthOf(cursor) === month });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (monthOf(cursor) === month);
  return weeks;
}
