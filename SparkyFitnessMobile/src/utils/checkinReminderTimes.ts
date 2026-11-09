export const MAX_CHECKIN_REMINDERS = 5;
export const DEFAULT_CHECKIN_REMINDER_TIME = '20:30';
/** `data.kind` carried by every mood check-in reminder notification. */
export const MOOD_CHECKIN_KIND = 'mood-checkin';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Keeps only valid zero-padded `HH:MM` strings, de-duplicated, sorted and capped
 * at MAX_CHECKIN_REMINDERS. An empty result falls back to the default time.
 */
export function normalizeCheckinReminderTimes(
  times: readonly string[],
  fallback: readonly string[] = [DEFAULT_CHECKIN_REMINDER_TIME],
  max: number = MAX_CHECKIN_REMINDERS
): string[] {
  const valid = [...new Set(times.filter((t) => TIME_PATTERN.test(t)))]
    .sort()
    .slice(0, max);
  return valid.length > 0 ? valid : [...fallback];
}

/** Brushing reminders (#1862): morning and evening by default, at most three. */
export const MAX_ORAL_CARE_REMINDERS = 3;
export const DEFAULT_ORAL_CARE_REMINDER_TIMES = ['08:00', '21:00'];
/** `data.kind` carried by every brushing reminder notification. */
export const ORAL_CARE_REMINDER_KIND = 'oral-care';
/** `data.kind` of the brushing timer's "done" ping. */
export const BRUSHING_TIMER_KIND = 'brushing-timer';

export function normalizeOralCareReminderTimes(
  times: readonly string[]
): string[] {
  return normalizeCheckinReminderTimes(
    times,
    DEFAULT_ORAL_CARE_REMINDER_TIMES,
    MAX_ORAL_CARE_REMINDERS
  );
}
