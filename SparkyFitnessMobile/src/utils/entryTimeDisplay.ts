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
  timeFormat?: EntryTimeFormat | null,
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
  return date.toLocaleTimeString(getAppLocale(), { hour: 'numeric', minute: '2-digit' });
}
