import {
  todayInZone,
  isValidTimeZone,
  localDateToDay,
} from '@workspace/shared';
/** Age in whole years on `day` ('YYYY-MM-DD'), or null without a date of birth. */
function ageOnDay(
  dob: string | Date | null | undefined,
  day: string
): number | null {
  if (!dob) return null;
  const dobStr = typeof dob === 'string' ? dob : localDateToDay(new Date(dob));
  const dayYear = parseInt(day.slice(0, 4), 10);
  const dayMonth = parseInt(day.slice(5, 7), 10);
  const dayOfMonth = parseInt(day.slice(8, 10), 10);
  const dobYear = parseInt(dobStr.slice(0, 4), 10);
  const dobMonth = parseInt(dobStr.slice(5, 7), 10);
  const dobDay = parseInt(dobStr.slice(8, 10), 10);
  let age = dayYear - dobYear;
  if (dayMonth < dobMonth || (dayMonth === dobMonth && dayOfMonth < dobDay)) {
    age--;
  }
  return age;
}

/**
 * Calculate a user's age today from their date of birth, respecting their timezone.
 * @param {string} dob - Date of birth as YYYY-MM-DD string
 * @param {string} timezone - IANA timezone string (e.g. 'America/New_York')
 * @returns {number|null} Age in years, or null if dob is falsy
 */
function userAge(dob: string | Date | null | undefined, timezone = 'UTC') {
  const tz = timezone && isValidTimeZone(timezone) ? timezone : 'UTC';
  return ageOnDay(dob, todayInZone(tz));
}
export { ageOnDay, userAge };
export default {
  ageOnDay,
  userAge,
};
