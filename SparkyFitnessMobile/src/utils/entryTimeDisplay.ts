import { toHourMinute } from '@workspace/shared';
import { getAppLocale } from '../localization';

/**
 * Formats a stored entry_time ('HH:MM' or 'HH:MM:SS') using the active
 * application locale (e.g. '1:45 PM' in en-US, '13:45' in pl-PL). Returns
 * null when there is no time set.
 */
export function formatTimeLabel(time: string | null | undefined): string | null {
  const hourMinute = toHourMinute(time);
  if (!hourMinute) return null;
  const [hours, minutes] = hourMinute.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(getAppLocale(), { hour: 'numeric', minute: '2-digit' });
}
