import { normalizePaceBand, type PaceBand } from "./paceTargets.ts";

/**
 * Training pace ranges worked out from a recent race result. The race is
 * turned into an equivalent 5K pace with Riegel's formula, and each kind of
 * stretch is a band around that pace. They are starting points for a runner who
 * has no better numbers, in seconds per kilometre, never applied without a tap.
 */

export interface PaceReferenceRace {
  /** How far the race was, in kilometres. */
  distanceKm: number;
  /** How long it took, in seconds. */
  seconds: number;
}

/** The races the pace reference can come from. */
export const PACE_REFERENCE_RACES = [
  { id: "5k", distanceKm: 5 },
  { id: "10k", distanceKm: 10 },
  { id: "half", distanceKm: 21.0975 },
  { id: "marathon", distanceKm: 42.195 },
] as const;

export type PaceReferenceRaceId = (typeof PACE_REFERENCE_RACES)[number]["id"];

export type PaceZoneName =
  "easy" | "interval" | "tempo" | "marathon" | "stride";

/** Riegel's exponent: how much slower the pace gets as the distance grows. */
const RIEGEL_EXPONENT = 1.06;

/** Fastest and slowest race pace worth working from: 2:30 and 12:00 per km. */
const FASTEST_RACE_PACE = 150;
const SLOWEST_RACE_PACE = 720;

/** Multiples of the equivalent 5K pace: the fast edge and the slow edge. */
const ZONE_FACTORS: Record<PaceZoneName, readonly [number, number]> = {
  easy: [1.2, 1.35],
  interval: [0.97, 1.03],
  tempo: [1.07, 1.12],
  marathon: [1.13, 1.19],
  stride: [0.88, 0.95],
};

/** Seconds per km rounded to the 5 s the pace steppers move by. */
const roundPace = (seconds: number): number => Math.round(seconds / 5) * 5;

/** The race's equivalent 5K pace in seconds per km, or null for a result that cannot be right. */
export function equivalent5kPace(race: PaceReferenceRace): number | null {
  const { distanceKm, seconds } = race;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(seconds)) return null;
  if (distanceKm < 1 || distanceKm > 50 || seconds <= 0) return null;
  const racePace = seconds / distanceKm;
  if (racePace < FASTEST_RACE_PACE || racePace > SLOWEST_RACE_PACE) {
    return null;
  }
  const fiveKSeconds = seconds * Math.pow(5 / distanceKm, RIEGEL_EXPONENT);
  return fiveKSeconds / 5;
}

/**
 * Pace ranges for each kind of stretch, or null when the race result cannot
 * be used. A zone whose range falls outside what a pace target allows is left
 * out.
 */
export function racePaceZones(
  race: PaceReferenceRace,
): Partial<Record<PaceZoneName, PaceBand>> | null {
  const pace = equivalent5kPace(race);
  if (pace === null) return null;
  const zones: Partial<Record<PaceZoneName, PaceBand>> = {};
  for (const name of Object.keys(ZONE_FACTORS) as PaceZoneName[]) {
    const [fast, slow] = ZONE_FACTORS[name];
    const band = normalizePaceBand({
      minSecondsPerKm: roundPace(pace * fast),
      maxSecondsPerKm: roundPace(pace * slow),
    });
    if (band) zones[name] = band;
  }
  return Object.keys(zones).length > 0 ? zones : null;
}
