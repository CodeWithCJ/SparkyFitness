import { toHourMinute } from '@workspace/shared';
import { getAppLocale } from '../localization';

/**
 * The canonical account time-format values (shared UserPreferences).
 * 'HH:mm' is 24-hour; 'h:mm A' and 'h:mm a' are 12-hour with AM/PM.
 */
export type EntryTimeFormat = 'HH:mm' | 'h:mm A' | 'h:mm a';

/**
 * Formats a stored entry_time ('HH:MM' or 'HH:MM:SS') for display.
 *
 * The account's `time_format` preference (24h vs 12h) is the source of truth:
 *   - 'HH:mm' -> "15:38"
 *   - 'h:mm A' / 'h:mm a' -> "3:38 PM" (AM/PM markers from the app locale)
 *   - no preference -> the app locale's default (en-US 12h / pl-PL 24h)
 *
 * Returns null when there is no time set. This keeps the diary row time and the
 * meal-detail/time-picker time consistent (both previously diverged because the
 * diary row used only the locale default while the picker respected the account
 * HH:mm preference).
 */
export function formatTimeLabel(
  time: string | null | undefined,
  timeFormat?: EntryTimeFormat | null
): string | null {
  const hourMinute = toHourMinute(time);
  if (!hourMinute) return null;

  // 24-hour account preference: the stored value is already 'HH:mm'.
  if (timeFormat === 'HH:mm') return hourMinute;

  // 12-hour account preference: render with AM/PM per the app locale.
  if (timeFormat === 'h:mm A' || timeFormat === 'h:mm a') {
    const [hours, minutes] = hourMinute.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString(getAppLocale(), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // No preference: fall back to the app locale's default convention.
  const [hours, minutes] = hourMinute.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(getAppLocale(), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a whole hour for a compact chart axis: "10 PM" or "22", never "10:00 PM".
 *
 * Axis ticks always land on the hour, so the ":00" carries no information while costing
 * horizontal space the plot could use instead. Follows the same account `time_format`
 * preference as `formatTimeLabel`, which is why it lives beside it rather than in the
 * chart — the two must never disagree about 12h vs 24h.
 */
export function formatHourLabel(
  hour24: number,
  timeFormat?: EntryTimeFormat | null
): string {
  // 24-hour account preference: zero-padded so a column of hours stays aligned.
  if (timeFormat === 'HH:mm') return String(hour24).padStart(2, '0');

  const date = new Date();
  date.setHours(hour24, 0, 0, 0);

  const usesMeridiem = timeFormat === 'h:mm A' || timeFormat === 'h:mm a';
  return date.toLocaleTimeString(getAppLocale(), {
    hour: 'numeric',
    ...(usesMeridiem ? { hour12: true } : {}),
  });
}
