import { DEFAULT_MEAL_ANCHOR_TIMES } from '@workspace/shared';

/**
 * Pick the meal type a drink logged "now" belongs to.
 *
 * #2115: a water container linked to a food may carry an explicit
 * linked_meal_type_id, meaning "always log to this bucket". When it does not,
 * the drink should land where it actually happened — a coffee at 08:00 is
 * breakfast, the same coffee at 20:00 is dinner. The previous fallback picked
 * getAllMealTypes()[0], so every drink all day landed in the first meal type
 * (almost always Breakfast).
 *
 * Nearest default_time wins, measured on a 24-hour clock without wrapping:
 * at 11:00, with breakfast 08:00 and lunch 12:30, lunch is closer and wins.
 * Ties go to the earlier meal, so the result never depends on row order.
 *
 * meal_types.default_time is nullable and ships NULL for the built-in meals, so
 * a type with no time of its own falls back to the shared anchor for its name
 * (DEFAULT_MEAL_ANCHOR_TIMES). Without that fallback this resolver would be
 * inert on a default install and every drink would land in whichever meal type
 * happened to come back first.
 *
 * A custom meal type with neither a default_time nor a known name cannot be
 * placed on the clock and is skipped; if nothing can be placed, the caller's
 * original order is honoured by returning the first entry.
 */

export interface MealTypeTimeCandidate {
  id: string;
  name?: string | null;
  default_time?: string | null;
}

/** A meal type's own time, else the shared anchor for its built-in name. */
function anchorFor(mealType: MealTypeTimeCandidate): number | null {
  const own = parseClockMinutes(mealType.default_time);
  if (own !== null) return own;
  const fallback =
    DEFAULT_MEAL_ANCHOR_TIMES[(mealType.name ?? '').toLowerCase()];
  return parseClockMinutes(fallback);
}

/** Minutes since midnight for "HH:MM" / "HH:MM:SS", or null if unparseable. */
export function parseClockMinutes(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function resolveMealTypeIdForTime(
  mealTypes: MealTypeTimeCandidate[],
  nowClock: string
): string | null {
  if (!mealTypes || mealTypes.length === 0) return null;

  const nowMinutes = parseClockMinutes(nowClock);
  if (nowMinutes === null) return mealTypes[0]?.id ?? null;

  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const mealType of mealTypes) {
    const minutes = anchorFor(mealType);
    if (minutes === null) continue;
    const distance = Math.abs(minutes - nowMinutes);
    // Strictly-less keeps the earlier meal on a tie, since callers pass them
    // in chronological order.
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = mealType.id;
    }
  }

  return bestId ?? mealTypes[0]?.id ?? null;
}
