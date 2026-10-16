/**
 * Training pace zones for running, worked out from one fitness reference: the
 * pace a person could hold for about an hour (their threshold pace). Pure and
 * unit-free (seconds per kilometre), like `paceTargets.ts`, so the phone, the
 * web app and the server share one set of rules.
 */

export type PaceZoneId =
  | "easy"
  | "steady"
  | "threshold"
  | "interval"
  | "repetition";

/** Seconds per kilometre. `min` is the fastest pace in the zone, `max` the slowest. */
export interface PaceZone {
  id: PaceZoneId;
  minSecondsPerKm: number;
  maxSecondsPerKm: number;
}

/** Slowest zone first, which is the order a runner reads them in. */
export const PACE_ZONE_IDS: readonly PaceZoneId[] = [
  "easy",
  "steady",
  "threshold",
  "interval",
  "repetition",
];

/**
 * Edges of each zone as multiples of threshold pace, fastest to slowest. The
 * zones touch, so every pace falls in exactly one: repetition 0.80-0.89,
 * interval 0.89-0.97, threshold 0.97-1.045, steady 1.045-1.145 (about marathon
 * pace) and easy 1.145-1.35.
 */
const ZONE_EDGES = [0.8, 0.89, 0.97, 1.045, 1.145, 1.35] as const;
const ZONES_FASTEST_FIRST: readonly PaceZoneId[] = [
  "repetition",
  "interval",
  "threshold",
  "steady",
  "easy",
];

/** Riegel's exponent: how much a pace slows as the distance grows. */
export const RIEGEL_EXPONENT = 1.06;
/** Threshold pace is the pace held for an hour. */
const THRESHOLD_SECONDS = 3600;
/** Efforts outside this range say little about an hour-long pace. */
export const MIN_EFFORT_METERS = 3000;
export const MAX_EFFORT_METERS = 25000;

/** Fastest and slowest threshold pace worth building zones on: 2:30 and 12:00 per km. */
const MIN_THRESHOLD_SECONDS_PER_KM = 150;
const MAX_THRESHOLD_SECONDS_PER_KM = 720;

const round5 = (seconds: number): number => Math.round(seconds / 5) * 5;

/**
 * Threshold pace from one hard effort of `distanceMeters` in `seconds`, by
 * Riegel's formula carried to a one hour run. Null for an effort that is too
 * short or too long to say anything, or a result that cannot be right.
 */
export function thresholdPaceFromEffort(
  distanceMeters: number,
  seconds: number,
): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(seconds)) return null;
  if (seconds <= 0) return null;
  if (distanceMeters < MIN_EFFORT_METERS || distanceMeters > MAX_EFFORT_METERS) {
    return null;
  }
  const hourMeters =
    distanceMeters * (THRESHOLD_SECONDS / seconds) ** (1 / RIEGEL_EXPONENT);
  const pace = THRESHOLD_SECONDS / (hourMeters / 1000);
  if (pace < MIN_THRESHOLD_SECONDS_PER_KM) return null;
  if (pace > MAX_THRESHOLD_SECONDS_PER_KM) return null;
  return pace;
}

/**
 * The five zones around `thresholdSecondsPerKm`, slowest first, paces rounded
 * to 5 s. `shift` moves every edge by that share (0.03 is 3% slower, negative
 * is faster) for easing off or pushing on. Null when the threshold is unusable.
 */
export function paceZones(
  thresholdSecondsPerKm: number,
  shift = 0,
): PaceZone[] | null {
  if (!Number.isFinite(thresholdSecondsPerKm)) return null;
  if (thresholdSecondsPerKm < MIN_THRESHOLD_SECONDS_PER_KM) return null;
  if (thresholdSecondsPerKm > MAX_THRESHOLD_SECONDS_PER_KM) return null;
  if (!Number.isFinite(shift) || shift < -0.2 || shift > 0.2) return null;
  const scale = thresholdSecondsPerKm * (1 + shift);
  const zones: PaceZone[] = [];
  ZONES_FASTEST_FIRST.forEach((id, index) => {
    const fast = ZONE_EDGES[index];
    const slow = ZONE_EDGES[index + 1];
    if (fast === undefined || slow === undefined) return;
    zones.push({
      id,
      minSecondsPerKm: round5(scale * fast),
      maxSecondsPerKm: round5(scale * slow),
    });
  });
  return zones.reverse();
}

/** The zone a pace falls in, or null when it is faster or slower than all of them. */
export function zoneForPace(
  zones: readonly PaceZone[],
  secondsPerKm: number,
): PaceZoneId | null {
  if (!Number.isFinite(secondsPerKm)) return null;
  for (const zone of zones) {
    if (
      secondsPerKm >= zone.minSecondsPerKm &&
      secondsPerKm < zone.maxSecondsPerKm
    ) {
      return zone.id;
    }
  }
  return null;
}

/** One zone by id. */
export function paceZone(
  zones: readonly PaceZone[],
  id: PaceZoneId,
): PaceZone | undefined {
  return zones.find((zone) => zone.id === id);
}

/** How far two hard-rated workouts in a row slow the zones, and two easy ones speed them. */
export const EASE_ZONE_SHIFT = 0.03;
export const ADVANCE_ZONE_SHIFT = -0.015;

/**
 * Zone shift for what a runner's effort ratings say: easing off slows every
 * zone 3%, moving on speeds them 1.5%, anything else leaves them alone. Takes
 * the output of `suggestFromEffort`.
 */
export function zoneShiftForEffort(
  suggestion: "ease" | "advance" | null,
): number {
  if (suggestion === "ease") return EASE_ZONE_SHIFT;
  if (suggestion === "advance") return ADVANCE_ZONE_SHIFT;
  return 0;
}
