import { toHourMinute } from '@workspace/shared';

/**
 * Apply a user-chosen time format to a Date. Supported date-fns style formats:
 *   - 'HH:mm'  → 24-hour (14:30)
 *   - 'h:mm A' → 12-hour uppercase (2:30 PM)
 *   - 'h:mm a' → 12-hour lowercase (2:30 pm)
 *
 * For any other format, falls back to the device locale default.
 */
function formatTime(date: Date, timeFormat?: string | null | undefined): string {
  if (timeFormat === 'HH:mm') {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  if (timeFormat === 'h:mm A' || timeFormat === 'h:mm a') {
    const hours24 = date.getHours();
    const isPM = hours24 >= 12;
    const hours12 = hours24 % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const marker = timeFormat === 'h:mm a'
      ? isPM ? 'pm' : 'am'
      : isPM ? 'PM' : 'AM';
    return `${hours12}:${minutes} ${marker}`;
  }

  // Use the device locale default.
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Formats a Date or ISO timestamp into a time string (e.g. '1:45 PM' or '14:30')
 * according to the user's time format preference. This is the canonical time
 * formatting function for the mobile app. All components that display times
 * should call this function.
 *
 * @param timestamp - ISO string, Date, or null/undefined.
 * @param timeFormat - Optional time format preference ('HH:mm' for 24h, anything else for 12h).
 *                     If omitted, uses the device locale default.
 * @returns The formatted time string, or null when the input is null/undefined.
 */
export function formatTimeOfDay(
  timestamp: string | Date | null | undefined,
  timeFormat?: string | null | undefined,
): string | null {
  if (!timestamp) return null;
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (isNaN(date.getTime())) return null;
  return formatTime(date, timeFormat);
}

/**
 * Formats a stored entry_time ('HH:MM' or 'HH:MM:SS') as a localized time
 * label (e.g. '1:45 PM' or '14:30'). Delegates to formatTimeOfDay.
 *
 * @param time - The time string to format.
 * @param timeFormat - Optional time format preference ('HH:mm' for 24h, 'h:mm A' or 'h:mm a' for 12h).
 *                     If omitted, uses the device locale default.
 * @returns The formatted time string, or null when there is no time set.
 */
export function formatTimeLabel(
  time: string | null | undefined,
  timeFormat?: string | null | undefined,
): string | null {
  const hourMinute = toHourMinute(time);
  if (!hourMinute) return null;
  const [hours, minutes] = hourMinute.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return formatTime(date, timeFormat);
}
