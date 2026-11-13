import {
  paceZones,
  thresholdPaceFromEffort,
  type PaceZone,
  type PaceZoneId,
} from './paceZones.ts';
import {
  equivalent5kPace,
  racePaceZones,
  type PaceZoneName,
} from './racePaceZones.ts';
import type { PaceBand } from './paceTargets.ts';
import { daysBetween } from './timezone.ts';

/**
 * Running fitness tests and the training paces they give. A test is one hard,
 * measured effort: a 5K time trial, a 30-minute all-out run or a 12-minute
 * Cooper test. Each is turned into a threshold pace and an equivalent 5K time,
 * and from those the pace zones of `paceZones.ts` and the race-based ranges of
 * `racePaceZones.ts`. Pure and unit-free (metres, seconds, seconds per km), so
 * the phone, the web app and the server work out the same numbers.
 */

export const FITNESS_TEST_TYPES = ['5k', '30min', 'cooper'] as const;
export type FitnessTestType = (typeof FITNESS_TEST_TYPES)[number];

export function isFitnessTestType(value: unknown): value is FitnessTestType {
  return (FITNESS_TEST_TYPES as readonly unknown[]).includes(value);
}

/** The 5K time trial runs exactly this far. */
export const FIVE_K_METERS = 5000;
/** The Cooper test runs this long. */
export const COOPER_SECONDS = 720;
/** The all-out run lasts this long. */
export const THIRTY_MINUTE_SECONDS = 1800;
/** Threshold pace is the average pace of the last 20 minutes of the 30-minute run. */
export const THIRTY_MINUTE_THRESHOLD_SECONDS = 1200;
/** So the last 20 minutes start 10 minutes in. */
export const THIRTY_MINUTE_SPLIT_SECONDS =
  THIRTY_MINUTE_SECONDS - THIRTY_MINUTE_THRESHOLD_SECONDS;

/** Riegel's exponent, as in `paceZones.ts` and `racePaceZones.ts`. */
const RIEGEL_EXPONENT = 1.06;

/** Where a test was run: outdoors with GPS, or indoors (a treadmill) with the distance typed in. */
export const FITNESS_TEST_SURFACES = ['outdoor', 'indoor'] as const;
export type FitnessTestSurface = (typeof FITNESS_TEST_SURFACES)[number];

/** Steepest treadmill incline the correction covers, in percent. */
export const MAX_INCLINE_PERCENT = 15;
/** The incline that stands in for a flat outdoor run (air resistance outdoors). */
export const FLAT_EQUIVALENT_INCLINE_PERCENT = 1;

/**
 * ACSM running equation: the oxygen cost of each metre run is
 * 0.2 + 0.9 x grade (grade as a fraction). Jones and Doust (1996) found that
 * a 1% incline makes a treadmill cost the same as a flat outdoor run.
 */
const ACSM_FLAT_COST = 0.2;
const ACSM_GRADE_COST = 0.9;

/**
 * How much faster (above 1) or slower (below 1) a treadmill speed is, in
 * flat-outdoor terms, at this incline. Exactly 1 at 1%; a 0% treadmill gives
 * about 0.957 (the same effort is a little easier than outdoors, so the speed
 * counts for less) and each extra percent adds about 4%. Null for an incline
 * that is not a number between 0 and 15.
 */
export function inclineSpeedFactor(inclinePercent: number): number | null {
  if (!Number.isFinite(inclinePercent)) return null;
  if (inclinePercent < 0 || inclinePercent > MAX_INCLINE_PERCENT) return null;
  const cost = (percent: number) =>
    ACSM_FLAT_COST + (ACSM_GRADE_COST * percent) / 100;
  return cost(inclinePercent) / cost(FLAT_EQUIVALENT_INCLINE_PERCENT);
}

/** What was measured. Distance is in metres and time in seconds. */
export interface FitnessTestMeasurement {
  type: FitnessTestType;
  /**
   * 5K: 5000. 30-minute run: the distance covered in 30 minutes. Cooper: the
   * distance covered in 12 minutes.
   */
  distanceMeters: number;
  /** 5K: the time taken. 30-minute run: 1800. Cooper: 720. */
  durationSeconds: number;
  /** 30-minute run only: the distance covered after the first 10 minutes. */
  splitDistanceMeters?: number | null;
  /** Treadmill incline, percent, when the person entered one. */
  inclinePercent?: number | null;
  /**
   * Whether to correct for the incline (the default when an incline is
   * given). Off uses the numbers as measured.
   */
  adjustForIncline?: boolean;
}

/**
 * The measurement as the incline correction sees it: the same effort in
 * flat-outdoor terms. A faster-than-flat treadmill (above 1%) credits more
 * distance in the same time, or less time for the 5K; a 0% treadmill credits
 * less. Unchanged without an incline, with the correction off, at exactly 1%,
 * or for an incline outside 0 to 15% (which `evaluateFitnessTest` refuses).
 */
export function applyIncline(
  measurement: FitnessTestMeasurement
): FitnessTestMeasurement {
  const { inclinePercent } = measurement;
  if (inclinePercent == null || measurement.adjustForIncline === false) {
    return measurement;
  }
  const factor = inclineSpeedFactor(inclinePercent);
  if (factor === null || factor === 1) return measurement;
  if (measurement.type === '5k') {
    return {
      ...measurement,
      durationSeconds: measurement.durationSeconds / factor,
    };
  }
  return {
    ...measurement,
    distanceMeters: measurement.distanceMeters * factor,
    splitDistanceMeters:
      measurement.splitDistanceMeters == null
        ? measurement.splitDistanceMeters
        : measurement.splitDistanceMeters * factor,
  };
}

/** What the person's training paces are worked out from. */
export interface FitnessTestPaces {
  /** Pace held for about an hour, in seconds per kilometre. */
  thresholdSecondsPerKm: number;
  /** The test as a 5K time, in seconds. */
  equivalent5kSeconds: number;
  /** The five zones around the threshold, slowest first. */
  zones: PaceZone[];
  /** Easy, interval, tempo, marathon and stride ranges from the 5K time. */
  raceZones: Partial<Record<PaceZoneName, PaceBand>>;
}

export interface FitnessTestOutcome {
  type: FitnessTestType;
  /**
   * The headline figure: seconds for the 5K, the pace of the last 20 minutes
   * (seconds per km) for the 30-minute run, metres for the Cooper test.
   */
  resultValue: number;
  paces: FitnessTestPaces;
}

/** A 12-minute distance as an equivalent 5K time in seconds, or null if it cannot be right. */
export function cooperToFiveKSeconds(distanceMeters: number): number | null {
  if (!Number.isFinite(distanceMeters)) return null;
  const pace = equivalent5kPace({
    distanceKm: distanceMeters / 1000,
    seconds: COOPER_SECONDS,
  });
  return pace === null ? null : pace * 5;
}

/**
 * The 30-minute run's threshold pace: the average pace of the last 20 minutes,
 * in seconds per km. Null when the split is missing or does not leave a
 * believable last 20 minutes.
 */
export function thirtyMinuteThresholdPace(
  distanceMeters: number,
  splitDistanceMeters: number | null | undefined
): number | null {
  if (typeof splitDistanceMeters !== 'number') return null;
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(splitDistanceMeters)
  ) {
    return null;
  }
  if (splitDistanceMeters <= 0) return null;
  const lastMeters = distanceMeters - splitDistanceMeters;
  if (lastMeters <= 0) return null;
  const pace = THIRTY_MINUTE_THRESHOLD_SECONDS / (lastMeters / 1000);
  return paceZones(pace) === null ? null : pace;
}

function pacesFor(
  thresholdSecondsPerKm: number,
  equivalent5kSeconds: number
): FitnessTestPaces | null {
  const threshold = Math.round(thresholdSecondsPerKm);
  const zones = paceZones(threshold);
  const raceZones = racePaceZones({
    distanceKm: FIVE_K_METERS / 1000,
    seconds: equivalent5kSeconds,
  });
  if (zones === null || raceZones === null) return null;
  return {
    thresholdSecondsPerKm: threshold,
    equivalent5kSeconds: Math.round(equivalent5kSeconds),
    zones,
    raceZones,
  };
}

/**
 * Works out a test: its headline result and the paces it gives. Null for a
 * measurement that does not fit its test or a result that cannot be right.
 */
export function evaluateFitnessTest(
  input: FitnessTestMeasurement
): FitnessTestOutcome | null {
  if (
    input.inclinePercent != null &&
    inclineSpeedFactor(input.inclinePercent) === null
  ) {
    return null;
  }
  const measurement = applyIncline(input);
  const { type, distanceMeters, durationSeconds } = measurement;
  if (!isFitnessTestType(type)) return null;
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    return null;
  }

  if (type === '5k') {
    if (distanceMeters !== FIVE_K_METERS) return null;
    const pace = equivalent5kPace({
      distanceKm: FIVE_K_METERS / 1000,
      seconds: durationSeconds,
    });
    const threshold = thresholdPaceFromEffort(FIVE_K_METERS, durationSeconds);
    if (pace === null || threshold === null) return null;
    const paces = pacesFor(threshold, durationSeconds);
    return paces && { type, resultValue: Math.round(durationSeconds), paces };
  }

  if (type === 'cooper') {
    if (durationSeconds !== COOPER_SECONDS) return null;
    const fiveK = cooperToFiveKSeconds(distanceMeters);
    if (fiveK === null) return null;
    const threshold = thresholdPaceFromEffort(FIVE_K_METERS, fiveK);
    if (threshold === null) return null;
    const paces = pacesFor(threshold, fiveK);
    return paces && { type, resultValue: Math.round(distanceMeters), paces };
  }

  if (durationSeconds !== THIRTY_MINUTE_SECONDS) return null;
  const threshold = thirtyMinuteThresholdPace(
    distanceMeters,
    measurement.splitDistanceMeters
  );
  const pace = equivalent5kPace({
    distanceKm: distanceMeters / 1000,
    seconds: THIRTY_MINUTE_SECONDS,
  });
  if (threshold === null || pace === null) return null;
  const paces = pacesFor(threshold, pace * 5);
  return paces && { type, resultValue: Math.round(threshold), paces };
}

/** How one zone's edges moved between two tests, in seconds per km (negative is faster). */
export interface ZoneChange {
  id: PaceZoneId;
  minChangeSeconds: number;
  maxChangeSeconds: number;
}

export interface PaceChange {
  thresholdChangeSeconds: number;
  equivalent5kChangeSeconds: number;
  zones: ZoneChange[];
}

/** How the paces moved from an earlier test to a later one. */
export function comparePaces(
  previous: FitnessTestPaces,
  current: FitnessTestPaces
): PaceChange {
  const zones: ZoneChange[] = [];
  for (const zone of current.zones) {
    const before = previous.zones.find((candidate) => candidate.id === zone.id);
    if (!before) continue;
    zones.push({
      id: zone.id,
      minChangeSeconds: zone.minSecondsPerKm - before.minSecondsPerKm,
      maxChangeSeconds: zone.maxSecondsPerKm - before.maxSecondsPerKm,
    });
  }
  return {
    thresholdChangeSeconds:
      current.thresholdSecondsPerKm - previous.thresholdSecondsPerKm,
    equivalent5kChangeSeconds:
      current.equivalent5kSeconds - previous.equivalent5kSeconds,
    zones,
  };
}

/** A retest is offered from six weeks after the last test... */
export const RETEST_AFTER_DAYS = 42;
/** ...and the six-to-eight-week window ends here; later it reads as overdue. */
export const RETEST_WINDOW_END_DAYS = 56;

export type RetestStatus = 'recent' | 'due' | 'overdue';

/**
 * Whether the latest test is recent enough, in the six-to-eight-week retest
 * window, or older still. Both days are `YYYY-MM-DD`.
 */
export function retestStatus(lastTestDay: string, today: string): RetestStatus {
  const age = daysBetween(lastTestDay, today);
  if (age < RETEST_AFTER_DAYS) return 'recent';
  return age <= RETEST_WINDOW_END_DAYS ? 'due' : 'overdue';
}

/** Whole weeks since the test, for wording ("7 weeks ago"). */
export function weeksSinceTest(lastTestDay: string, today: string): number {
  return Math.max(0, Math.floor(daysBetween(lastTestDay, today) / 7));
}

/** The pace per km a person could hold over `distanceKm`, from a 5K time, by Riegel's formula. */
export function racePaceFromFiveK(
  fiveKSeconds: number,
  distanceKm: number
): number | null {
  if (!Number.isFinite(fiveKSeconds) || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (fiveKSeconds <= 0 || distanceKm <= 0) return null;
  const seconds = fiveKSeconds * Math.pow(distanceKm / 5, RIEGEL_EXPONENT);
  return seconds / distanceKm;
}

/** Where a person starts from, by 5K time. */
export type TestFitnessLevel = 'new' | 'some' | 'regular' | 'experienced';

/** The starting level a 5K time points to, in the words the race planner uses. */
export function levelFromFiveK(fiveKSeconds: number): TestFitnessLevel {
  if (fiveKSeconds >= 36 * 60) return 'new';
  if (fiveKSeconds >= 29 * 60) return 'some';
  if (fiveKSeconds >= 23 * 60) return 'regular';
  return 'experienced';
}

/**
 * A built-in program that follows on from a person who has just run a 5K
 * effort: building up to a 10K for a slower time, speed work for a quicker one.
 */
export function programIdForFiveK(fiveKSeconds: number): string {
  if (fiveKSeconds >= 35 * 60) return 'fiveToTenK';
  if (fiveKSeconds >= 26 * 60) return 'faster5k';
  return 'faster10k';
}
