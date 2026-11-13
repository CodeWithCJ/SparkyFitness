import preferenceRepository from '../models/preferenceRepository.js';

/**
 * The account's first day of the week (0 = Sunday ... 6 = Saturday), as the calendars use
 * it, from a `user_preferences` row. Sunday when unset or not a day of the week.
 */
export function firstDayOfWeekOf(
  preferences: { first_day_of_week?: unknown } | null | undefined
): number {
  const raw = preferences?.first_day_of_week;
  const day = raw === null || raw === undefined ? 0 : Number(raw);
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : 0;
}

/** Loads the user's preferences for their first day of the week; see `firstDayOfWeekOf`. */
export async function loadFirstDayOfWeek(userId: string): Promise<number> {
  return firstDayOfWeekOf(
    await preferenceRepository.getUserPreferences(userId)
  );
}
