import { getUserPreferences } from '../models/preferenceRepository.js';
import { isValidTimeZone } from '@workspace/shared';
async function loadUserTimezone(userId) {
  try {
    const prefs = await getUserPreferences(userId);
    const tz = prefs?.timezone;
    if (tz && isValidTimeZone(tz)) return tz;
    return 'UTC';
  } catch {
    return 'UTC';
  }
}
export { loadUserTimezone };
export default {
  loadUserTimezone,
};
