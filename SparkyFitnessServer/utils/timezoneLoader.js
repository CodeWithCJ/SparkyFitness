const { getUserPreferences } = require('../models/preferenceRepository');
const { isValidTimeZone } = require('@workspace/shared');

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

module.exports = { loadUserTimezone };
