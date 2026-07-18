import { addDays } from "./timezone.ts";

// ---------------------------------------------------------------------------
// Month-grid construction (no timezone needed — pure day-string arithmetic)
// ---------------------------------------------------------------------------

export interface MonthGrid {
  /** First day-string (YYYY-MM-DD) shown in the grid, always a `firstDayOfWeek` weekday. */
  gridStart: string;
  /** Last day-string (YYYY-MM-DD) shown in the grid. */
  gridEnd: string;
  /** Every day-string in the grid, in order, left-to-right / top-to-bottom. */
  days: string[];
}

/**
 * Builds the day-strings for a month calendar grid: the target month plus enough
 * leading/trailing days from adjacent months to fill complete weeks, given the
 * user's preferred first day of the week.
 *
 * @param year - full year, e.g. 2026
 * @param month - 1-indexed month (1 = January, 12 = December)
 * @param firstDayOfWeek - 0 = Sunday, 1 = Monday, ... 6 = Saturday
 */
export function buildMonthGrid(
  year: number,
  month: number,
  firstDayOfWeek: number,
): MonthGrid {
  const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;

  const startDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (startDayOfWeek - firstDayOfWeek + 7) % 7;
  const gridStart = addDays(monthStart, -offset);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = offset + daysInMonth > 35 ? 42 : 35;

  const days: string[] = [];
  for (let i = 0; i < cellCount; i++) {
    days.push(addDays(gridStart, i));
  }

  return { gridStart, gridEnd: days[days.length - 1]!, days };
}
