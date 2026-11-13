/**
 * Weighted-carry distance. Storage is kilometres, the same as every other set
 * distance. The number a person types is metres, or yards when the app's
 * distance unit is miles, because a carry is short.
 *
 * Canonical for web and mobile. Do not copy these into a client.
 */

/** International yard: 1000 / 0.9144. */
const YARDS_PER_KM = 1093.6133;

/** Carry distance in metres, or yards when `distanceUnit` is `miles`. */
export function carryDistanceFromKm(km: number, distanceUnit: string): number {
  return distanceUnit === 'miles' ? km * YARDS_PER_KM : km * 1000;
}

/** Metres (or yards, when `distanceUnit` is `miles`) back to stored kilometres. */
export function carryDistanceToKm(value: number, distanceUnit: string): number {
  return distanceUnit === 'miles' ? value / YARDS_PER_KM : value / 1000;
}

/** Short label for the unit `carryDistanceFromKm` returns. */
export function carryDistanceUnitLabel(distanceUnit: string): 'm' | 'yd' {
  return distanceUnit === 'miles' ? 'yd' : 'm';
}
