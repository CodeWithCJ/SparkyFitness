import { dayToPickerDate, isDayString } from '@workspace/shared';
import { getAppLocale } from '../localization';

/** "Wed, Oct 14" (or "Wed, October 14") for a YYYY-MM-DD calendar day. */
export function formatDayLabel(
  day: string,
  month: 'long' | 'short' = 'short'
): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getAppLocale(), {
    weekday: 'short',
    month,
    day: 'numeric',
  });
}

/** A calendar day with its year, for dates far enough out that the year matters; anything else as it is. */
export const formatDateWithYear = (day: string): string => {
  if (!isDayString(day)) return day;
  return dayToPickerDate(day).toLocaleDateString(getAppLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** "Mar 2026" for a YYYY-MM-DD calendar day, for an axis that spans months. */
export function formatMonthYear(day: string): string {
  return dayToPickerDate(day).toLocaleDateString(getAppLocale(), {
    month: 'short',
    year: 'numeric',
  });
}
