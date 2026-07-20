import { toHourMinute } from '@workspace/shared';

/**
 * Formats a stored entry_time ('HH:MM' or 'HH:MM:SS') as a localized 12h
 * label (e.g. '1:45 PM'). Returns null when there is no time set.
 */
export function formatTimeLabel(time: string | null | undefined): string | null {
  const hourMinute = toHourMinute(time);
  if (!hourMinute) return null;
  const [hours, minutes] = hourMinute.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
