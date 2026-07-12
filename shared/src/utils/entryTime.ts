import { userHourMinute } from "./timezone.ts";

/**
 * Helpers for the optional wall-clock time-of-day on diary entries
 * (food_entries.entry_time, exercise_entries.entry_time, ...) and the
 * per-meal-type default time (meal_types.default_time).
 *
 * Times are plain local wall-clock strings with no timezone attached:
 * requests send 'HH:MM'; Postgres TIME columns come back as 'HH:MM:SS'.
 */

const TIME_STRING_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Returns true if the value is a 24h 'HH:MM' or 'HH:MM:SS' string. */
export function isEntryTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_STRING_REGEX.test(value);
}

/**
 * Normalizes 'HH:MM:SS' (or 'HH:MM') to 'HH:MM' for display and
 * `<input type="time">` values. Returns null for null/undefined/invalid input.
 */
export function toHourMinute(
  time: string | null | undefined,
): string | null {
  if (!isEntryTimeString(time)) return null;
  return time.slice(0, 5);
}

/**
 * Earliest entry_time among a list of entries (e.g. a workout session's
 * exercises), or null when none has a time set.
 */
export function earliestEntryTime(
  entries: ReadonlyArray<{ entry_time?: string | null }>,
): string | null {
  let earliest: string | null = null;
  for (const entry of entries) {
    const time = entry.entry_time;
    if (typeof time !== "string" || time === "") continue;
    if (earliest === null || time < earliest) earliest = time;
  }
  return earliest;
}

/**
 * Comparator fragment for ordering diary entries by entry_time: entries with
 * a time sort chronologically and come before entries without one. Returns 0
 * when neither has a time (or the times are equal) so callers can chain their
 * secondary ordering with ||.
 */
export function compareByEntryTime(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const timeA = typeof a === "string" && a !== "" ? a : null;
  const timeB = typeof b === "string" && b !== "" ? b : null;
  if (timeA && timeB) return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
  if (timeA) return -1;
  if (timeB) return 1;
  return 0;
}

interface MealTypeWithDefaultTime {
  name: string;
  default_time?: string | null;
}

const FALLBACK_MEAL_BUCKETS: Array<{ maxHourExclusive: number; name: string }> =
  [
    { maxHourExclusive: 11, name: "breakfast" },
    { maxHourExclusive: 15, name: "lunch" },
    { maxHourExclusive: 20, name: "dinner" },
    { maxHourExclusive: 24, name: "snacks" },
  ];

function timeToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Picks the meal type name to default to for the given time of day.
 *
 * Among meal types with a default_time, returns the one with the latest
 * default_time <= now. If none qualifies, falls back to hour buckets
 * (breakfast <11, lunch <15, dinner <20, else snacks), matched
 * case-insensitively against the provided list; if the fallback name is not
 * in the list, returns the first entry's name.
 */
export function defaultMealTypeForTime(
  mealTypes: MealTypeWithDefaultTime[],
  now: { hour: number; minute: number },
): string {
  if (mealTypes.length === 0) return "breakfast";
  const nowMinutes = now.hour * 60 + now.minute;

  let best: MealTypeWithDefaultTime | null = null;
  let bestMinutes = -1;
  for (const mealType of mealTypes) {
    if (!isEntryTimeString(mealType.default_time)) continue;
    const minutes = timeToMinutes(mealType.default_time);
    if (minutes <= nowMinutes && minutes > bestMinutes) {
      best = mealType;
      bestMinutes = minutes;
    }
  }
  if (best) return best.name;

  const bucket = FALLBACK_MEAL_BUCKETS.find(
    (b) => now.hour < b.maxHourExclusive,
  );
  const fallbackName = bucket ? bucket.name : "snacks";
  const match = mealTypes.find(
    (mealType) => mealType.name.toLowerCase() === fallbackName,
  );
  return match ? match.name : mealTypes[0]!.name;
}

/**
 * Prefill value for a diary entry time picker: the meal type's default_time
 * (trimmed to HH:MM) if set; otherwise the current HH:MM in the user's
 * timezone when logging for today; otherwise '' (time stays optional).
 */
export function prefillEntryTime(opts: {
  defaultTime?: string | null;
  isToday: boolean;
  tz: string;
}): string {
  if (opts.isToday) {
    const { hour, minute } = userHourMinute(opts.tz);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const fromDefault = toHourMinute(opts.defaultTime);
  if (fromDefault) return fromDefault;
  return "";
}
