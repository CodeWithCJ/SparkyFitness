import { getUserPreferences } from '../models/preferenceRepository.js';
import {
  isValidTimeZone,
  isDayString,
  compareDays,
  todayInZone,
} from '@workspace/shared';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadUserTimezone(userId: any) {
  try {
    const prefs = await getUserPreferences(userId);
    const tz = prefs?.timezone;
    if (tz && isValidTimeZone(tz)) return tz;
    return 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Resolves the calendar day from which a plan template (re)generates diary
 * entries. `clientDate` is caller-supplied, so it is honored only when it is a
 * valid day string on or after the user's current day; anything earlier or
 * malformed falls back to the user's today. That floor keeps a template refresh
 * anchored to today, since it also bounds the delete of previously generated
 * entries.
 */
async function resolveTemplateStartDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  clientDate?: string | null
) {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  if (
    typeof clientDate === 'string' &&
    isDayString(clientDate) &&
    compareDays(clientDate, today) > 0
  ) {
    return clientDate;
  }
  return today;
}

export { loadUserTimezone, resolveTemplateStartDay };
export default {
  loadUserTimezone,
  resolveTemplateStartDay,
};
