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
