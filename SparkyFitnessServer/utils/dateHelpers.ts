import {
  todayInZone,
  isValidTimeZone,
  localDateToDay,
} from '@workspace/shared';
/**
 * Calculate a user's age from their date of birth, respecting their timezone.
 * @param {string} dob - Date of birth as YYYY-MM-DD string
 * @param {string} timezone - IANA timezone string (e.g. 'America/New_York')
 * @returns {number|null} Age in years, or null if dob is falsy
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userAge(dob: any, timezone = 'UTC') {
  if (!dob) return null;
  const tz = timezone && isValidTimeZone(timezone) ? timezone : 'UTC';
  const today = todayInZone(tz);
  const todayYear = parseInt(today.slice(0, 4), 10);
  const todayMonth = parseInt(today.slice(5, 7), 10);
  const todayDay = parseInt(today.slice(8, 10), 10);
  const dobStr = typeof dob === 'string' ? dob : localDateToDay(new Date(dob));
  const dobYear = parseInt(dobStr.slice(0, 4), 10);
  const dobMonth = parseInt(dobStr.slice(5, 7), 10);
  const dobDay = parseInt(dobStr.slice(8, 10), 10);
  let age = todayYear - dobYear;
  if (todayMonth < dobMonth || (todayMonth === dobMonth && todayDay < dobDay)) {
    age--;
  }
  return age;
}
export { userAge };
export default {
  userAge,
};
