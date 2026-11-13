import { todayInZone } from '@workspace/shared';
import { getTodayDate } from './dateUtils';

/**
 * The day a mood screen works on when asked for `day`. The dashboard passes
 * the device's day, which can differ from the day in the profile zone; the
 * device's today counts as the zone's today, so a new check-in, its time and
 * the day list it shows up in all land on one day. Any other day is itself.
 */
export function moodDayInZone(day: string, tz: string): string {
  return day === getTodayDate() ? todayInZone(tz) : day;
}
